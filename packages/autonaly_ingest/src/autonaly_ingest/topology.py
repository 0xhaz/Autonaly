"""Pub/Sub topology: signals topic, subscription, and the dead-letter path.

Identical code against the emulator and against real Pub/Sub — the emulator
supports dead-letter policies, so the failure path is genuinely exercised
locally rather than only in production.
"""

from __future__ import annotations

import logging

from autonaly_core import get_settings
from google.api_core.exceptions import AlreadyExists
from google.cloud import pubsub_v1

log = logging.getLogger(__name__)

# After this many failed deliveries the message goes to the dead-letter topic.
# A malformed signal fails its Pydantic gate every time, so it lands here rather
# than being retried forever. Pub/Sub enforces a minimum of 5.
MAX_DELIVERY_ATTEMPTS = 5

DLQ_SUBSCRIPTION = "signals-dlq-sub"

# An agent run takes a minute or two, but the subscriber client extends the lease
# automatically while a callback is working, so a long deadline buys nothing. It
# costs a lot: at 600s a worker killed mid-message locks that message for ten
# minutes, which makes the replay demo unrehearsable.
ACK_DEADLINE_SECONDS = 60


def ensure_topology() -> dict[str, str]:
    """Create topics, the main subscription with its DLQ policy, and a DLQ reader.

    Idempotent — safe to run before every injection or worker start.
    """
    settings = get_settings()
    publisher = pubsub_v1.PublisherClient()
    subscriber = pubsub_v1.SubscriberClient()
    project = settings.project_id

    signals_topic = publisher.topic_path(project, settings.signals_topic)
    dlq_topic = publisher.topic_path(project, settings.dlq_topic)

    for topic in (signals_topic, dlq_topic):
        try:
            publisher.create_topic(name=topic)
            log.info("created topic %s", topic)
        except AlreadyExists:
            pass

    signals_sub = subscriber.subscription_path(project, settings.signals_subscription)
    dead_letter_policy = {
        "dead_letter_topic": dlq_topic,
        "max_delivery_attempts": MAX_DELIVERY_ATTEMPTS,
    }
    try:
        subscriber.create_subscription(
            request={
                "name": signals_sub,
                "topic": signals_topic,
                "dead_letter_policy": dead_letter_policy,
                "ack_deadline_seconds": ACK_DEADLINE_SECONDS,
            }
        )
        log.info("created subscription %s with dead-letter policy", signals_sub)
    except AlreadyExists:
        # A subscription created earlier without a dead-letter policy would
        # redeliver a poisoned message forever, so reconcile rather than skip.
        # Found the hard way: the P0 smoke test created this subscription first.
        existing = subscriber.get_subscription(request={"subscription": signals_sub})
        needs = []
        if not existing.dead_letter_policy.dead_letter_topic:
            needs.append("dead_letter_policy")
        if existing.ack_deadline_seconds != ACK_DEADLINE_SECONDS:
            needs.append("ack_deadline_seconds")
        if needs:
            subscriber.update_subscription(
                request={
                    "subscription": {
                        "name": signals_sub,
                        "dead_letter_policy": dead_letter_policy,
                        "ack_deadline_seconds": ACK_DEADLINE_SECONDS,
                    },
                    "update_mask": {"paths": needs},
                }
            )
            log.info("reconciled subscription %s: %s", signals_sub, ", ".join(needs))

    dlq_sub = subscriber.subscription_path(project, DLQ_SUBSCRIPTION)
    try:
        subscriber.create_subscription(request={"name": dlq_sub, "topic": dlq_topic})
    except AlreadyExists:
        pass

    return {
        "signals_topic": signals_topic,
        "dlq_topic": dlq_topic,
        "signals_subscription": signals_sub,
        "dlq_subscription": dlq_sub,
    }


def drain_dlq(limit: int = 10) -> list[dict]:
    """Read what failed, without acking. Used to show the DLQ path on camera."""
    settings = get_settings()
    subscriber = pubsub_v1.SubscriberClient()
    path = subscriber.subscription_path(settings.project_id, DLQ_SUBSCRIPTION)

    response = subscriber.pull(
        request={"subscription": path, "max_messages": limit}, timeout=10.0
    )
    return [
        {
            "data": message.message.data.decode("utf-8", errors="replace"),
            "attributes": dict(message.message.attributes),
            "delivery_attempt": message.delivery_attempt,
        }
        for message in response.received_messages
    ]

"""EventBus adapter — one implementation for both environments.

The Pub/Sub client library routes to the emulator whenever PUBSUB_EMULATOR_HOST
is set, so local and cloud run byte-identical code. That is the whole trick
(workplan.md §1).
"""

from __future__ import annotations

import os
from collections.abc import Callable


class PubSubEventBus:
    def __init__(self, project: str) -> None:
        from google.cloud import pubsub_v1

        self.project = project
        self._publisher = pubsub_v1.PublisherClient()
        self._subscriber = pubsub_v1.SubscriberClient()

    @property
    def using_emulator(self) -> bool:
        return bool(os.environ.get("PUBSUB_EMULATOR_HOST"))

    def topic_path(self, topic: str) -> str:
        return self._publisher.topic_path(self.project, topic)

    def subscription_path(self, subscription: str) -> str:
        return self._subscriber.subscription_path(self.project, subscription)

    def ensure_topic(self, topic: str) -> str:
        from google.api_core.exceptions import AlreadyExists

        path = self.topic_path(topic)
        try:
            self._publisher.create_topic(name=path)
        except AlreadyExists:
            pass
        return path

    def ensure_subscription(self, subscription: str, topic: str) -> str:
        from google.api_core.exceptions import AlreadyExists

        path = self.subscription_path(subscription)
        try:
            self._subscriber.create_subscription(name=path, topic=self.topic_path(topic))
        except AlreadyExists:
            pass
        return path

    def publish(self, topic: str, payload: bytes, **attributes: str) -> str:
        return self._publisher.publish(self.topic_path(topic), payload, **attributes).result()

    def subscribe(
        self, subscription: str, handler: Callable[[bytes, dict[str, str]], None]
    ) -> None:
        def _callback(message) -> None:  # noqa: ANN001 - pubsub message type
            try:
                handler(message.data, dict(message.attributes))
                message.ack()
            except Exception:
                message.nack()  # redelivery, then DLQ after max attempts
                raise

        future = self._subscriber.subscribe(self.subscription_path(subscription), _callback)
        future.result()

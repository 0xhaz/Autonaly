"""A century of supply crises, curated as reference data.

History doesn't repeat, but it rhymes: when an analyst speculates about a
Taiwan blockade, the 1996 missile crisis and the 2021 chip drought are the
reference class. This module is that reference class — qualitative, dated,
reviewed in git like every other curated table in this codebase.

Rules of curation, in the spirit of the chokepoint table:
  - Events are facts of record (wars, embargoes, closures, disasters), each
    with its years and a one-line account. No invented statistics: figures
    appear only where they are the well-documented heart of the event.
  - `baskets` names only the modelled commodity groups the event actually
    disrupted; an event outside the modelled baskets carries none.
  - `rhyme` is the transferable pattern — what the event teaches about the
    NEXT one — because that is what a speculating analyst needs from history.
  - Financial crises appear for context but are typed as such: the desk
    refuses to score them, and history explains why they still matter.
"""

from __future__ import annotations

from dataclasses import dataclass, field

CATEGORIES = (
    "war",
    "blockade",
    "embargo",
    "sanctions",
    "export_ban",
    "canal_closure",
    "disaster",
    "pandemic",
    "revolution",
    "strike",
    "drought",
    "financial",
)


@dataclass(frozen=True)
class Outcome:
    """What actually repriced (architecture D32) — a base rate, not advice.

    Curated magnitudes from the well-documented record, hedged where the
    record is approximate. These are the numbers an analyst reaches for when
    asked "and what did that do to prices last time"."""

    metric: str
    move: str
    window: str


@dataclass(frozen=True)
class CrisisEvent:
    key: str
    title: str
    year_start: int
    year_end: int | None  # None = ongoing at curation time
    countries: tuple[str, ...]  # ISO3 of the disrupted / disrupting parties
    category: str
    summary: str
    rhyme: str
    baskets: tuple[str, ...] = field(default=())
    chokepoints: tuple[str, ...] = field(default=())
    outcomes: tuple[Outcome, ...] = field(default=())


EVENTS: tuple[CrisisEvent, ...] = (
    CrisisEvent(
        "wwi-blockade", "Allied naval blockade of Germany", 1914, 1919,
        ("DEU", "GBR"), "blockade",
        "The Royal Navy's distant blockade cut Germany off from overseas food "
        "and fertilizer imports for the length of the war and beyond the "
        "armistice, contributing to severe civilian famine.",
        "A blockade of a fertilizer- and food-importing economy kills slowly "
        "and civilians first; import dependence is a wartime vulnerability.",
        ("wheat", "nitrogen_fertilizer"),
    ),
    CrisisEvent(
        "soviet-revolution", "Russian Revolution and civil war", 1917, 1922,
        ("RUS", "UKR"), "revolution",
        "Revolution and civil war collapsed the Russian Empire's grain "
        "exports, which had been the world's largest before 1914; European "
        "importers rewired to the Americas.",
        "A political collapse in a breadbasket exporter forces a decade-scale "
        "rewiring of world grain trade, not a season of disruption.",
        ("wheat", "barley"),
    ),
    CrisisEvent(
        "smoot-hawley", "Smoot-Hawley tariffs and the trade collapse", 1930, 1934,
        ("USA",), "financial",
        "The 1930 US tariff act triggered global retaliation as the "
        "Depression deepened; world trade fell by roughly two-thirds in value "
        "between 1929 and 1933.",
        "Protection begets retaliation: a tariff shock propagates through "
        "partners' responses, not just the first country's imports.",
    ),
    CrisisEvent(
        "spanish-civil-war", "Spanish Civil War", 1936, 1939,
        ("ESP",), "war",
        "Three years of civil war and naval blockade collapsed Spain's trade "
        "and its citrus, ore and mercury exports.",
        "Civil wars embargo a country as effectively as foreign navies do.",
        ("iron_ore",),
    ),
    CrisisEvent(
        "wwii-atlantic", "Second World War: Battle of the Atlantic", 1939, 1945,
        ("GBR", "DEU"), "blockade",
        "U-boat warfare against Allied shipping and the Allied blockade of "
        "occupied Europe made every import a convoy problem; Britain rationed "
        "food for years and lost millions of tons of shipping.",
        "Against a sea-denial campaign, the binding constraint becomes ships "
        "and escorts, not the goods themselves.",
        ("wheat", "crude_oil", "refined_products"),
    ),
    CrisisEvent(
        "us-oil-embargo-japan", "US oil embargo on Japan", 1941, 1941,
        ("JPN", "USA"), "embargo",
        "Washington froze Japanese assets and embargoed oil exports in "
        "mid-1941; Japan, importing the great majority of its oil from the "
        "US, attacked Pearl Harbor within months.",
        "An energy embargo on an import-dependent power is not a sanction, it "
        "is an ultimatum — expect escalation, not compliance.",
        ("crude_oil", "refined_products"),
    ),
    CrisisEvent(
        "berlin-blockade", "Berlin blockade and airlift", 1948, 1949,
        ("DEU", "RUS"), "blockade",
        "The Soviet Union closed all land routes into West Berlin for eleven "
        "months; the Western allies supplied a city of two million entirely "
        "by air until the blockade was lifted.",
        "A blockade fails when the blockaded party finds a channel the "
        "blockader cannot close without open war.",
    ),
    CrisisEvent(
        "korean-war", "Korean War", 1950, 1953,
        ("KOR", "PRK", "CHN"), "war",
        "Invasion and three years of war destroyed Korean industry and "
        "shipping; the conflict triggered a global commodity price spike as "
        "the West stockpiled strategic materials.",
        "Wars move commodity prices through stockpiling panic long before "
        "physical shortages arrive.",
    ),
    CrisisEvent(
        "iran-nationalization", "Iranian oil nationalization and embargo", 1951, 1954,
        ("IRN", "GBR"), "embargo",
        "Iran nationalized the Anglo-Iranian Oil Company; a British-led "
        "embargo and blockade cut Iranian oil exports to near zero for three "
        "years until the 1953 coup and a new consortium.",
        "Buyers' cartels can embargo a seller as effectively as sellers "
        "embargo buyers — and the political consequences last decades.",
        ("crude_oil",), ("hormuz",),
    ),
    CrisisEvent(
        "suez-1956", "Suez Crisis", 1956, 1957,
        ("EGY", "GBR", "FRA", "ISR"), "canal_closure",
        "Egypt nationalized the canal; the ensuing war closed it for five "
        "months and sank ships in the channel. Europe rationed oil while "
        "tankers rerouted around the Cape.",
        "The canal's closure is survivable; the question is who pays the "
        "rerouting cost and how fast tanker capacity absorbs it.",
        ("crude_oil", "refined_products"), ("suez",),
    ),
    CrisisEvent(
        "taiwan-1958", "Second Taiwan Strait Crisis", 1958, 1958,
        ("TWN", "CHN"), "blockade",
        "PRC artillery bombarded Quemoy and attempted to interdict resupply; "
        "US naval escorts kept the garrison supplied and the crisis subsided "
        "without invasion.",
        "Strait crises are rehearsals: each one tests what level of "
        "interdiction the other side's navy will answer.",
        (), ("taiwan_strait",),
    ),
    CrisisEvent(
        "cuba-embargo", "US embargo on Cuba", 1960, None,
        ("CUB", "USA"), "embargo",
        "The US embargo, comprehensive from 1962, severed Cuba from its "
        "natural market; the island rewired its sugar trade to the Soviet "
        "bloc and never regained its prior export economy.",
        "A unilateral embargo with no coalition rewires trade rather than "
        "stopping it — at permanent cost to both sides.",
    ),
    CrisisEvent(
        "cuban-missile-crisis", "Cuban missile crisis quarantine", 1962, 1962,
        ("CUB", "USA", "RUS"), "blockade",
        "The US Navy's 'quarantine' of Cuba was a selective blockade aimed at "
        "Soviet missile shipments, resolved by negotiation in thirteen days.",
        "A blockade can be a signalling instrument: narrow in scope, total in "
        "implication.",
    ),
    CrisisEvent(
        "suez-1967", "Suez Canal closed for eight years", 1967, 1975,
        ("EGY", "ISR"), "canal_closure",
        "The Six-Day War closed the canal from 1967 to 1975, stranding "
        "fourteen ships inside; world shipping adapted with supertankers "
        "built for the Cape route.",
        "A long closure doesn't just reroute trade — it redesigns the ships. "
        "Adaptation makes some closures permanent even after reopening.",
        ("crude_oil",), ("suez",),
    ),
    CrisisEvent(
        "biafra", "Nigerian civil war and Biafra blockade", 1967, 1970,
        ("NGA",), "blockade",
        "The federal blockade of secessionist Biafra produced mass famine "
        "and halted the region's oil exports until the war's end.",
        "Internal blockades starve regions the way naval ones starve "
        "islands; oil majors negotiate with whoever holds the terminals.",
        ("crude_oil",),
    ),
    CrisisEvent(
        "chile-copper", "Chilean copper nationalization and coup", 1971, 1974,
        ("CHL",), "revolution",
        "Chile nationalized the copper majors in 1971; strikes, embargoed "
        "credit and the 1973 coup disrupted output from the world's largest "
        "copper exporter through the mid-1970s.",
        "Resource nationalization invites financial siege: the disruption "
        "arrives through credit and shipping insurance before the mines slow.",
    ),
    CrisisEvent(
        "soviet-grain-1972", "The great grain robbery", 1972, 1973,
        ("RUS", "USA"), "export_ban",
        "After a catastrophic harvest, the USSR quietly bought a quarter of "
        "the US wheat crop at subsidized prices; world wheat prices tripled "
        "within a year.",
        "Opaque state buying moves grain markets as violently as export "
        "bans — watch the importer's silence, not just the exporter's.",
        ("wheat", "maize"),
        outcomes=(
            Outcome("US wheat", "roughly tripled", "mid-1972 – early 1974"),
        ),
    ),
    CrisisEvent(
        "opec-embargo", "OPEC oil embargo", 1973, 1974,
        ("SAU", "ARE", "KWT", "IRQ", "USA", "NLD"), "embargo",
        "Arab producers embargoed the US and the Netherlands and cut output "
        "after the Yom Kippur War; oil prices roughly quadrupled and Western "
        "economies entered stagflation.",
        "A seller's embargo works when the cartel controls marginal supply; "
        "its legacy is the buyer's strategic reserves built to blunt the "
        "next one.",
        ("crude_oil", "refined_products"), ("hormuz",),
        outcomes=(
            Outcome("Crude oil (posted price)", "roughly quadrupled, ~$3 to ~$12 per barrel", "Oct 1973 – Jan 1974"),
        ),
    ),
    CrisisEvent(
        "lebanon-civil-war", "Lebanese civil war", 1975, 1990,
        ("LBN",), "war",
        "Fifteen years of civil war destroyed Beirut's role as the Levant's "
        "port and financial entrepôt; trade routed permanently through "
        "neighbouring hubs.",
        "Entrepôt economies don't get their transit trade back after long "
        "wars — the routes learn to live without them.",
    ),
    CrisisEvent(
        "iran-revolution", "Iranian Revolution and second oil shock", 1978, 1980,
        ("IRN",), "revolution",
        "Strikes in the Iranian oil fields and the fall of the Shah removed "
        "millions of barrels a day from the market; prices more than doubled "
        "even though other producers expanded output.",
        "Markets price the fear of the next barrel lost, not the barrels "
        "actually lost — revolution in an exporter moves prices beyond its "
        "own volumes.",
        ("crude_oil",), ("hormuz",),
        outcomes=(
            Outcome("Crude oil", "more than doubled, ~$13 to over $30 per barrel", "1979 – mid-1980"),
        ),
    ),
    CrisisEvent(
        "us-grain-embargo", "US grain embargo on the USSR", 1980, 1981,
        ("USA", "RUS"), "embargo",
        "After the invasion of Afghanistan, Washington embargoed grain sales "
        "to the USSR; Argentina and others filled the gap within a season "
        "and the embargo was lifted as a failure.",
        "Commodity embargoes without near-universal supplier coalitions "
        "merely reshuffle the customer list.",
        ("wheat", "maize"),
    ),
    CrisisEvent(
        "iran-iraq-tanker-war", "Iran–Iraq War and the tanker war", 1980, 1988,
        ("IRN", "IRQ"), "war",
        "Eight years of war included systematic attacks on Gulf tankers; "
        "hundreds of ships were hit, the US reflagged Kuwaiti tankers, yet "
        "Hormuz never closed and oil kept flowing at a risk premium.",
        "Even a shooting war at a chokepoint tends to tax flow rather than "
        "stop it — insurance premiums are the real transmission channel.",
        ("crude_oil", "lng"), ("hormuz",),
    ),
    CrisisEvent(
        "falklands", "Falklands War exclusion zone", 1982, 1982,
        ("ARG", "GBR"), "war",
        "Britain declared a maritime exclusion zone and fought a "
        "ten-week naval war; Argentine trade was briefly embargoed by the "
        "EEC and grain deals rerouted.",
        "Short wars produce short embargoes; the lasting damage is to "
        "credit and investment, not cargo.",
    ),
    CrisisEvent(
        "ethiopia-famine", "Ethiopian famine", 1983, 1985,
        ("ETH",), "drought",
        "War, drought and policy produced a famine that killed hundreds of "
        "thousands despite global relief; ports and trucking, not food "
        "availability, were the binding constraint.",
        "In famine logistics the chokepoint is inland transport — aid "
        "arriving at a port does not mean aid arriving.",
        ("wheat",),
    ),
    CrisisEvent(
        "chernobyl", "Chernobyl disaster", 1986, 1987,
        ("UKR", "RUS", "BLR"), "disaster",
        "The reactor explosion contaminated agricultural land across "
        "Ukraine, Belarus and beyond; European countries restricted food "
        "imports and farm produce for years.",
        "Contamination events embargo a region's agriculture through "
        "consumer fear long after measured risk subsides.",
        ("wheat", "barley"),
    ),
    CrisisEvent(
        "gulf-war", "Iraqi invasion of Kuwait and Gulf War", 1990, 1991,
        ("IRQ", "KWT"), "war",
        "The invasion removed both Iraqi and Kuwaiti oil from the market "
        "under UN embargo; prices spiked until other producers expanded and "
        "the war restored Kuwaiti fields — which burned for months.",
        "The market's answer to a double supply loss is spare capacity; the "
        "question for the next crisis is who holds it.",
        ("crude_oil",), ("hormuz",),
        outcomes=(
            Outcome("Brent crude", "roughly doubled, ~$17 to ~$36 per barrel", "Aug – Oct 1990"),
        ),
    ),
    CrisisEvent(
        "ussr-collapse", "Collapse of the Soviet Union", 1991, 1994,
        ("RUS", "UKR", "KAZ", "BLR"), "revolution",
        "The USSR's dissolution shattered integrated supply chains across "
        "fifteen new borders; industrial output halved and every successor "
        "state's trade had to be rebuilt from scratch.",
        "When an integrated economy fragments, the borders themselves are "
        "the supply shock — customs posts where none existed.",
        ("crude_oil", "lng", "wheat", "potash", "aluminium"),
    ),
    CrisisEvent(
        "yugoslav-sanctions", "Yugoslav wars and sanctions", 1992, 1995,
        ("SRB",), "sanctions",
        "UN sanctions on rump Yugoslavia banned trade and froze assets "
        "during the Bosnian war; Danube shipping was disrupted for the whole "
        "region.",
        "Sanctions on a transit country tax its neighbours — the Danube's "
        "closure billed Bulgaria and Romania for Belgrade's war.",
    ),
    CrisisEvent(
        "taiwan-1996", "Third Taiwan Strait Crisis", 1995, 1996,
        ("TWN", "CHN"), "blockade",
        "PRC missile tests bracketed Taiwan's main ports ahead of its first "
        "direct presidential election; two US carrier groups deployed and "
        "shipping insurance and air routes were disrupted for weeks.",
        "Missile closures of port approaches are blockade by insurance "
        "premium — no ship needs to be hit for traffic to stop.",
        ("semiconductors",), ("taiwan_strait",),
    ),
    CrisisEvent(
        "asian-financial-crisis", "Asian financial crisis", 1997, 1998,
        ("THA", "IDN", "KOR", "MYS"), "financial",
        "Currency collapses across East Asia halved import capacity in the "
        "affected economies; trade volumes fell through demand, not "
        "disruption.",
        "Financial crises move trade through purchasing power, not physical "
        "supply — which is why a trade-flow model must refuse to score them.",
    ),
    CrisisEvent(
        "russia-default-1998", "Russian default and devaluation", 1998, 1999,
        ("RUS",), "financial",
        "Russia defaulted on domestic debt and the rouble collapsed; import "
        "volumes halved while commodity exports, repriced in devalued "
        "currency, carried the recovery.",
        "Exporter defaults rarely interrupt commodity flows — cheap currency "
        "makes the exports more competitive, not less.",
    ),
    CrisisEvent(
        "taiwan-921-quake", "Taiwan 921 earthquake", 1999, 1999,
        ("TWN",), "disaster",
        "A magnitude-7.6 quake cut power to Hsinchu's science parks; world "
        "memory-chip prices spiked within days over roughly two weeks of "
        "lost fab output.",
        "Semiconductor supply is hostage to the electrical grid of one "
        "island — days of outage move world prices.",
        ("semiconductors",),
    ),
    CrisisEvent(
        "zimbabwe-land", "Zimbabwe land seizures and agricultural collapse", 2000, 2008,
        ("ZWE",), "revolution",
        "Farm seizures collapsed commercial agriculture in a former regional "
        "grain exporter; Zimbabwe swung to structural food imports amid "
        "hyperinflation.",
        "Domestic policy can destroy an export sector as thoroughly as any "
        "blockade — and the region's food balance flips with it.",
        ("maize",),
    ),
    CrisisEvent(
        "us-port-lockout", "US West Coast port lockout", 2002, 2002,
        ("USA",), "strike",
        "A ten-day employer lockout closed twenty-nine West Coast ports; "
        "ships queued offshore and just-in-time manufacturers idled until a "
        "federal injunction reopened the docks.",
        "Port labour disputes are chokepoint closures by other means — ten "
        "days of closure takes months to unwind.",
    ),
    CrisisEvent(
        "sars", "SARS epidemic", 2002, 2003,
        ("CHN", "HKG", "SGP"), "pandemic",
        "SARS shut travel and slowed factories across East Asia's trade "
        "hubs for months; it previewed, at small scale, what a serious "
        "pandemic would do to hub economies.",
        "Epidemics hit trade through hubs: the cities that route everything "
        "are the cities that close first.",
    ),
    CrisisEvent(
        "iraq-war-2003", "Iraq War", 2003, 2011,
        ("IRQ",), "war",
        "Invasion and insurgency kept Iraqi oil exports erratic for years; "
        "pipeline sabotage made the recovery slower than the war.",
        "Post-war export recovery is an infrastructure security problem — "
        "the ceasefire is not the reopening.",
        ("crude_oil",),
    ),
    CrisisEvent(
        "indian-ocean-tsunami", "Indian Ocean tsunami", 2004, 2005,
        ("IDN", "LKA", "THA", "IND"), "disaster",
        "The Boxing Day tsunami killed a quarter of a million people and "
        "destroyed coastal infrastructure around the Indian Ocean; Malacca "
        "shipping was briefly disrupted by changed channels.",
        "Mega-disasters redraw charts — literally: the channel a port relied "
        "on can move.",
        (), ("malacca",),
    ),
    CrisisEvent(
        "katrina", "Hurricane Katrina", 2005, 2005,
        ("USA",), "disaster",
        "Katrina shut Gulf of Mexico oil production, refineries and the "
        "Mississippi grain export system simultaneously; the US released "
        "strategic reserves and grain barges backed up for weeks.",
        "One storm can hit energy and food logistics at once when both "
        "share a coast — correlated infrastructure is the hidden exposure.",
        ("crude_oil", "refined_products", "maize", "soybeans"),
    ),
    CrisisEvent(
        "russia-ukraine-gas", "Russia–Ukraine gas disputes", 2006, 2009,
        ("RUS", "UKR"), "export_ban",
        "Pricing disputes twice halted Russian gas transit through Ukraine "
        "in mid-winter, cutting supplies to a dozen European countries for "
        "up to two weeks.",
        "Pipeline dependence is chokepoint dependence without ships — and "
        "the cutoffs arrive in January.",
        ("lng",),
    ),
    CrisisEvent(
        "food-crisis-2008", "Global food price crisis and export bans", 2007, 2008,
        ("VNM", "IND", "ARG", "EGY"), "export_ban",
        "As grain prices spiked, Vietnam and India restricted rice exports "
        "and Argentina taxed wheat; bans cascaded as each exporter protected "
        "its own market, amplifying the price spiral importers faced.",
        "Export bans are contagious: each one raises the price that "
        "justifies the next. The cascade, not the harvest, makes the crisis.",
        ("rice", "wheat"),
        outcomes=(
            Outcome("Rice", "roughly tripled in about six months", "late 2007 – mid 2008"),
        ),
    ),
    CrisisEvent(
        "georgia-war", "Russo-Georgian War", 2008, 2008,
        ("GEO", "RUS"), "war",
        "A five-day war threatened the BTC and Baku–Supsa pipelines and "
        "closed Georgian ports briefly; Caspian energy transit resumed "
        "within weeks.",
        "Transit-corridor wars are priced in hours: the market watches the "
        "pipeline map, not the front line.",
        ("crude_oil",),
    ),
    CrisisEvent(
        "gfc", "Global financial crisis", 2008, 2009,
        ("USA", "GBR", "DEU", "CHN"), "financial",
        "The banking collapse froze trade finance; world trade volumes fell "
        "faster than in 1930 for a year even though no route, port or "
        "commodity was physically disrupted.",
        "Trade runs on letters of credit: when banks fail, ships sail empty "
        "past open ports. A physical-exposure model must know its limits.",
    ),
    CrisisEvent(
        "russia-wheat-ban", "Russian wheat export ban", 2010, 2011,
        ("RUS",), "export_ban",
        "Drought and wildfires destroyed a third of the Russian harvest; "
        "Moscow banned wheat exports for nearly a year and world prices "
        "surged, feeding into the Arab Spring's bread protests.",
        "An exporter's domestic drought becomes an importer's political "
        "crisis — grain price shocks land hardest where bread is politics.",
        ("wheat", "barley"),
        outcomes=(
            Outcome("Wheat futures", "up on the order of 60–80%", "Jun – Aug 2010"),
        ),
    ),
    CrisisEvent(
        "china-rare-earths", "China's rare-earth restrictions", 2010, 2014,
        ("CHN", "JPN"), "export_ban",
        "Amid the Senkaku dispute, China tightened rare-earth export quotas; "
        "prices rose several-fold before new mines, substitution and a WTO "
        "ruling unwound the squeeze.",
        "A monopoly squeeze on a niche input works once: the price spike "
        "finances the mines that end the monopoly.",
        ("rare_earths", "rare_earth_magnets"),
        outcomes=(
            Outcome("Rare-earth oxide prices", "multiplied severalfold — some oxides more than tenfold — then collapsed as new supply arrived", "2010 – 2013"),
        ),
    ),
    CrisisEvent(
        "eyjafjallajokull", "Eyjafjallajökull ash cloud", 2010, 2010,
        ("ISL",), "disaster",
        "Volcanic ash closed most European airspace for about a week, "
        "stranding air freight; sea and rail cargo were untouched.",
        "Air-freight supply chains have no sea-level fallback measured in "
        "days — perishables and chips feel a week of closed sky.",
    ),
    CrisisEvent(
        "arab-spring", "Arab Spring", 2010, 2012,
        ("EGY", "TUN", "LBY", "SYR"), "revolution",
        "Uprisings across the Arab world disrupted Libyan oil entirely, put "
        "a risk premium on Suez transit, and were themselves partly fed by "
        "imported-grain price shocks.",
        "Food import dependence and political stability are one system: the "
        "wheat price is upstream of the revolution, which is upstream of "
        "the oil price.",
        ("crude_oil", "wheat"), ("suez",),
    ),
    CrisisEvent(
        "fukushima", "Tōhoku earthquake and Fukushima disaster", 2011, 2012,
        ("JPN",), "disaster",
        "The quake and tsunami shut Japanese auto and electronics plants "
        "whose single-source components idled assembly lines worldwide; "
        "Japan's nuclear shutdown then rewired global LNG flows for years.",
        "Tier-two suppliers are the hidden chokepoints: the world learns "
        "what one factory made only when it stops.",
        ("semiconductors", "lng"),
        outcomes=(
            Outcome("Japanese auto output", "fell by around half at the trough as single-source parts ran out", "Apr – Jun 2011"),
            Outcome("Japanese LNG imports", "rose sharply for years as the nuclear fleet shut down", "2011 – 2014"),
        ),
    ),
    CrisisEvent(
        "thai-floods", "Thailand floods and the hard-drive shortage", 2011, 2012,
        ("THA",), "disaster",
        "Months of flooding submerged industrial estates producing a large "
        "share of the world's hard drives and auto components; drive prices "
        "roughly doubled for a year.",
        "Industrial clustering converts a local flood into a global "
        "electronics shortage — geography of factories is destiny.",
        ("semiconductors",),
        outcomes=(
            Outcome("Hard-drive prices", "roughly doubled, staying elevated for about a year", "Q4 2011 – 2012"),
        ),
    ),
    CrisisEvent(
        "libya-war", "Libyan civil war", 2011, None,
        ("LBY",), "war",
        "Revolution and recurring civil war have made Libyan oil exports "
        "swing between near-zero and full capacity repeatedly for over a "
        "decade, hostage to whoever controls the export terminals.",
        "In fractured states, export capacity is a hostage taken by every "
        "faction in turn — supply reliability dies before the state does.",
        ("crude_oil",), ("gibraltar",),
    ),
    CrisisEvent(
        "syria-war", "Syrian civil war", 2011, None,
        ("SYR",), "war",
        "War destroyed Syria's oil production, phosphate exports and the "
        "region's overland trade routes; neighbours absorbed both refugees "
        "and rerouted transit.",
        "A land-route war taxes every neighbour's trade — transit corridors "
        "die with the country they cross.",
        ("phosphate_fertilizer", "crude_oil"),
    ),
    CrisisEvent(
        "iran-sanctions-2012", "Iran oil sanctions and SWIFT cutoff", 2012, 2015,
        ("IRN",), "sanctions",
        "EU embargo and expulsion from SWIFT roughly halved Iranian oil "
        "exports; Asian buyers continued under waivers, and grey-fleet "
        "workarounds emerged that outlived the sanctions.",
        "Financial-system sanctions cut deeper than trade bans — but they "
        "teach the target and its customers to build parallel plumbing.",
        ("crude_oil",), ("hormuz",),
    ),
    CrisisEvent(
        "crimea", "Annexation of Crimea and Donbas war", 2014, 2021,
        ("UKR", "RUS"), "sanctions",
        "Russia annexed Crimea and fuelled war in the Donbas; Western "
        "sanctions and counter-sanctions began the long decoupling of "
        "Russian and European trade, and Ukraine lost Azov port capacity.",
        "The first round of sanctions is a warning shot that restructures "
        "slowly — and positions everyone for the full rupture later.",
        ("wheat", "iron_ore"), ("bosporus",),
    ),
    CrisisEvent(
        "ebola", "West African Ebola epidemic", 2014, 2016,
        ("LBR", "SLE", "GIN"), "pandemic",
        "The epidemic closed borders and slowed ports across West Africa; "
        "iron-ore and agricultural exports fell as workforces and logistics "
        "seized up.",
        "Epidemic border closures strangle small exporters whose entire "
        "trade crosses two or three crossings.",
        ("iron_ore",),
    ),
    CrisisEvent(
        "yemen-war", "Yemen war and Red Sea insecurity", 2015, None,
        ("YEM", "SAU"), "war",
        "Coalition blockade of Yemeni ports produced one of the world's "
        "worst humanitarian crises, and the war seeded the missile and "
        "drone threat to Bab el-Mandeb shipping realized in 2023.",
        "A war beside a chokepoint eventually prices itself into the "
        "chokepoint — the strait inherits the conflict on its shore.",
        (), ("bab_el_mandeb",),
    ),
    CrisisEvent(
        "qatar-blockade", "Qatar blockade", 2017, 2021,
        ("QAT", "SAU", "ARE"), "blockade",
        "Saudi Arabia, the UAE and allies severed land, sea and air links "
        "with Qatar for over three years; LNG exports continued uninterrupted "
        "while food imports rewired through Oman, Turkey and Iran within "
        "weeks.",
        "A rich blockaded state buys new supply chains in weeks; the "
        "blockade's main product is the target's permanent self-sufficiency "
        "drive.",
        ("lng",), ("hormuz",),
    ),
    CrisisEvent(
        "nk-sanctions", "North Korea maximum-pressure sanctions", 2017, None,
        ("PRK", "CHN"), "sanctions",
        "UN sanctions banned North Korean coal, iron and seafood exports; "
        "enforcement depends almost entirely on China, and ship-to-ship "
        "transfers became the sanctions-evasion template.",
        "Sanctions are only as strong as the neighbour that enforces them — "
        "and the evasion techniques they incubate spread to other pariahs.",
        ("coal",),
    ),
    CrisisEvent(
        "us-china-trade-war", "US–China trade war", 2018, 2020,
        ("USA", "CHN"), "sanctions",
        "Tariffs on hundreds of billions of dollars of bilateral trade "
        "rerouted soybeans through Brazil, electronics through Vietnam and "
        "Mexico, and began the 'de-risking' era of supply-chain policy.",
        "Tariff wars don't shrink trade so much as detour it — the third "
        "countries on the detour are the structural winners.",
        ("soybeans", "semiconductors"),
    ),
    CrisisEvent(
        "abqaiq", "Abqaiq–Khurais drone attack", 2019, 2019,
        ("SAU",), "war",
        "Drone and missile strikes on Saudi processing facilities knocked "
        "out roughly half of Saudi output — about 5% of world supply — for "
        "several weeks; prices spiked then subsided as repairs outpaced "
        "fears.",
        "A precision strike can remove more supply in an hour than a year "
        "of war — and modern repair speed is the underrated stabilizer.",
        ("crude_oil",), ("hormuz",),
        outcomes=(
            Outcome("Brent crude", "jumped ~15% on reopen — the largest single-day move since 1991 — and retraced within weeks", "Sep 2019"),
        ),
    ),
    CrisisEvent(
        "japan-korea-chips", "Japan–Korea semiconductor materials dispute", 2019, 2023,
        ("JPN", "KOR"), "export_ban",
        "Japan restricted exports of three chipmaking chemicals to South "
        "Korea over a wartime-labour ruling; Korean fabs scrambled "
        "inventories and localized supply, and the restrictions were later "
        "lifted.",
        "Even allies weaponize niche inputs — and the target's response is "
        "always localization, permanently shrinking the leverage.",
        ("semiconductors",),
    ),
    CrisisEvent(
        "venezuela-collapse", "Venezuelan oil collapse and sanctions", 2017, None,
        ("VEN",), "sanctions",
        "Mismanagement and US sanctions collapsed PDVSA's output from "
        "world-scale to a fraction of it; heavy-crude refiners on the US "
        "Gulf rewired to other suppliers.",
        "Gradual collapses give markets time to adapt — the last barrel "
        "lost moves prices less than the first headline.",
        ("crude_oil",),
    ),
    CrisisEvent(
        "covid", "COVID-19 pandemic", 2020, 2022,
        ("CHN", "USA", "DEU", "IND"), "pandemic",
        "Lockdowns closed factories and ports in waves; PPE and vaccine "
        "export bans proliferated, container rates rose several-fold, and "
        "the whiplash of collapsed-then-surging demand broke schedules for "
        "two years.",
        "Pandemic disruption is demand whiplash plus port queues — the "
        "goods exist, the system connecting them loses its rhythm.",
        ("semiconductors",),
        outcomes=(
            Outcome("Container spot rates (Drewry WCI)", "rose roughly fivefold to records above $10,000/FEU", "2020 – late 2021"),
            Outcome("Chip lead times", "stretched beyond 20 weeks at the peak of the shortage", "2021 – 2022"),
        ),
    ),
    CrisisEvent(
        "indonesia-nickel", "Indonesian nickel ore export ban", 2020, None,
        ("IDN",), "export_ban",
        "Indonesia banned raw nickel ore exports to force smelting onshore; "
        "the strategy captured downstream battery-metal investment and "
        "reshaped the global nickel trade.",
        "Export bans as industrial policy: the resource stays home so the "
        "factories must come to it. Expect imitators.",
    ),
    CrisisEvent(
        "texas-freeze", "Texas winter storm Uri", 2021, 2021,
        ("USA",), "disaster",
        "A deep freeze shut Gulf Coast petrochemical plants and chip fabs; "
        "plastics feedstocks were scarce for months in the middle of the "
        "chip shortage.",
        "Climate tail-events hit industrial clusters built for a different "
        "weather regime — winterization is supply-chain policy.",
        ("semiconductors", "lpg"),
    ),
    CrisisEvent(
        "ever-given", "Ever Given grounding", 2021, 2021,
        ("EGY",), "canal_closure",
        "A single megaship wedged across the Suez Canal for six days; "
        "hundreds of ships queued, some rerouted via the Cape, and schedule "
        "disruption rippled for months though transits fell only modestly "
        "over the episode.",
        "Short chokepoint closures are delay shocks, not supply shocks — "
        "measured transits, not headlines, are the severity.",
        (), ("suez",),
        outcomes=(
            Outcome("Suez transit queue", "several hundred ships waiting; schedule disruption rippled for months", "Mar – Jun 2021"),
            Outcome("Crude oil", "moved a few percent on the headlines and retraced within days", "Mar 2021"),
        ),
    ),
    CrisisEvent(
        "chip-shortage", "Global chip shortage", 2020, 2023,
        ("TWN", "KOR", "JPN", "USA", "DEU"), "disaster",
        "Pandemic demand whiplash, fires, freezes and drought at fab sites "
        "compounded into a two-year semiconductor shortage that idled auto "
        "plants worldwide and launched subsidized fab-building programs on "
        "three continents.",
        "When a concentrated industry runs at full capacity, every small "
        "shock compounds — and the policy response outlives the shortage.",
        ("semiconductors",), ("taiwan_strait",),
    ),
    CrisisEvent(
        "taiwan-drought", "Taiwan chip drought", 2021, 2021,
        ("TWN",), "drought",
        "Taiwan's worst drought in half a century forced water rationing "
        "around its science parks during the chip shortage; fabs trucked in "
        "water to keep lines running.",
        "The scarcest input in the most advanced industry can be water — "
        "climate risk audits belong in chip-supply analysis.",
        ("semiconductors",),
    ),
    CrisisEvent(
        "energy-squeeze-2021", "European gas squeeze", 2021, 2022,
        ("RUS", "DEU"), "export_ban",
        "Russian pipeline flows to Europe tightened through autumn 2021 as "
        "storage sat unfilled; prices reached records before the invasion "
        "confirmed the squeeze was strategy, not market.",
        "A supplier quietly under-delivering into a tight market is the "
        "reconnaissance phase of a supply war.",
        ("lng",),
    ),
    CrisisEvent(
        "russia-ukraine-war", "Russian invasion of Ukraine", 2022, None,
        ("RUS", "UKR", "BLR"), "war",
        "The invasion blockaded Ukraine's Black Sea grain ports, triggered "
        "sweeping coalition sanctions on Russian energy, and squeezed world "
        "fertilizer supply; the grain corridor deal and rerouted energy "
        "flows partially adapted trade over the following years.",
        "A war between an agricultural and an energy superpower is several "
        "distinct shocks at once — physical blockade, legal sanctions and "
        "financial squeeze each pick different victims.",
        ("wheat", "maize", "barley", "crude_oil", "refined_products",
         "coal", "potash", "nitrogen_fertilizer", "iron_ore"),
        ("bosporus",),
        outcomes=(
            Outcome("Wheat futures", "up roughly 60% to record highs", "Feb – Mar 2022"),
            Outcome("European gas (TTF)", "peaked near €340/MWh, an order of magnitude above pre-crisis norms", "Aug 2022"),
            Outcome("Potash and urea", "multi-year highs before retracing as flows rerouted", "2022"),
        ),
    ),
    CrisisEvent(
        "india-wheat-ban", "Indian wheat export ban", 2022, 2022,
        ("IND",), "export_ban",
        "A heatwave-damaged harvest plus war-driven prices led India to ban "
        "wheat exports weeks after promising to feed the gap Ukraine left; "
        "prices jumped on the announcement.",
        "In a tight market, announced supply is load-bearing: withdrawing a "
        "promise moves prices like losing a harvest.",
        ("wheat",),
        outcomes=(
            Outcome("Chicago wheat futures", "limit-up ~6% on the announcement", "May 2022"),
        ),
    ),
    CrisisEvent(
        "indonesia-palm-ban", "Indonesian palm oil export ban", 2022, 2022,
        ("IDN",), "export_ban",
        "Facing domestic cooking-oil prices, Indonesia briefly banned palm "
        "oil exports — nearly a third of world vegetable-oil trade — before "
        "reversing within a month under fiscal pressure.",
        "Exporters that depend on export revenue cannot sustain their own "
        "bans — watch the fiscal clock, not the announcement.",
    ),
    CrisisEvent(
        "pelosi-exercises", "Taiwan encirclement exercises", 2022, None,
        ("TWN", "CHN"), "blockade",
        "After the US Speaker's visit, the PLA rehearsed a blockade with "
        "live-fire zones ringing Taiwan; shipping routed around the zones "
        "for a week, and the exercises have been repeated at each political "
        "trigger since.",
        "Recurring blockade rehearsals normalize the map of a real one — "
        "each drill is a dry run priced by insurers.",
        ("semiconductors",), ("taiwan_strait",),
    ),
    CrisisEvent(
        "panama-drought", "Panama Canal drought restrictions", 2023, 2024,
        ("PAN",), "drought",
        "Drought lowered Gatún Lake and the canal authority cut daily "
        "transits by roughly a third at the worst; bulkers and gas carriers "
        "diverted to Suez and the Cape while container lines paid for "
        "priority slots.",
        "Climate can throttle a chokepoint no navy could close — and "
        "rationing by auction decides who reroutes.",
        ("lng", "lpg", "maize", "soybeans"), ("panama",),
        outcomes=(
            Outcome("Transit slot auctions", "premiums reached millions of dollars per passage at the squeeze's peak", "late 2023"),
        ),
    ),
    CrisisEvent(
        "gallium-germanium", "China's gallium and germanium controls", 2023, None,
        ("CHN",), "export_ban",
        "Answering chip-tool export controls, China imposed licensing on "
        "gallium and germanium — niche metals it dominates — and later "
        "graphite and antimony; a tit-for-tat regime of critical-minerals "
        "controls hardened on both sides.",
        "Export controls now come in matched pairs: every restriction "
        "upstream is answered by one downstream. Map both directions.",
        ("rare_earths", "graphite"),
    ),
    CrisisEvent(
        "red-sea-crisis", "Red Sea shipping crisis", 2023, None,
        ("YEM", "EGY"), "war",
        "Houthi missile and drone attacks on shipping after October 2023 "
        "drove most container traffic from the Red Sea to the Cape route; "
        "Suez transits and Egypt's canal revenues fell by roughly half while "
        "war-risk premiums repriced the region.",
        "A cheap missile threat closes a chokepoint commercially without "
        "closing it physically — insurers, not navies, decide when it "
        "reopens.",
        (), ("suez", "bab_el_mandeb"),
        outcomes=(
            Outcome("Asia–Europe container spot rates", "roughly tripled", "Dec 2023 – Jan 2024"),
            Outcome("Suez transits and canal revenue", "fell by about half", "2024"),
        ),
    ),
    CrisisEvent(
        "baltimore-bridge", "Baltimore bridge collapse", 2024, 2024,
        ("USA",), "disaster",
        "A containership felled the Francis Scott Key Bridge, closing the "
        "Port of Baltimore — a top US auto and coal gateway — for about "
        "eleven weeks while wreckage was cleared.",
        "One ship, one bridge, one port: harbour infrastructure is a "
        "single-point failure that no cargo diversity fixes.",
        ("coal",),
    ),
    CrisisEvent(
        "kazakh-unrest", "Kazakhstan January unrest", 2022, 2022,
        ("KAZ",), "revolution",
        "Fuel-price protests escalated into nationwide unrest; internet "
        "blackouts and strikes briefly disrupted oil output and uranium "
        "shipments from the world's largest uranium producer.",
        "Landlocked commodity exporters concentrate risk in domestic "
        "stability — there is no sea route around a general strike.",
        ("crude_oil",),
    ),
    CrisisEvent(
        "nagorno-karabakh", "Second Nagorno-Karabakh war and Lachin blockade", 2020, 2023,
        ("ARM", "AZE"), "war",
        "War and the later blockade of the Lachin corridor cut Karabakh's "
        "only supply road for months, ending in the enclave's depopulation; "
        "regional transit projects were redrawn around the outcome.",
        "Corridor blockades decide wars in the Caucasus — and every "
        "pipeline and rail project inherits the new map.",
    ),
    CrisisEvent(
        "sri-lanka-crisis", "Sri Lankan economic collapse", 2021, 2022,
        ("LKA",), "financial",
        "Reserve exhaustion left Sri Lanka unable to pay for fuel, food and "
        "fertilizer imports; a fertilizer-import ban devastated harvests "
        "and the government fell amid fuel queues.",
        "Import-dependence plus reserve crisis equals physical shortage "
        "without any external disruption at all — the foreign-exchange "
        "position is part of supply security.",
        ("nitrogen_fertilizer", "refined_products"),
    ),
    CrisisEvent(
        "niger-coup", "Niger coup and uranium suspension", 2023, 2024,
        ("NER", "FRA"), "revolution",
        "The coup suspended uranium shipments from a top supplier of "
        "France's nuclear fleet and triggered ECOWAS sanctions and border "
        "closures across the Sahel.",
        "Single-source strategic minerals from fragile states are a "
        "standing invitation to political shock.",
    ),
    CrisisEvent(
        "myanmar-coup", "Myanmar coup and rare-earth belt", 2021, None,
        ("MMR", "CHN"), "revolution",
        "The coup and civil war placed the Kachin heavy-rare-earth mining "
        "belt — feeding Chinese processors — inside a conflict zone, with "
        "supply swinging on militia control of border crossings.",
        "The mine can be in one country and the chokepoint in its civil "
        "war — upstream fragility hides two borders away.",
        ("rare_earths",),
    ),
    CrisisEvent(
        "black-sea-grain-deal", "Black Sea grain corridor and its collapse", 2022, 2023,
        ("UKR", "RUS", "TUR"), "blockade",
        "The UN-Turkey brokered corridor moved tens of millions of tonnes "
        "of Ukrainian grain through the blockade for a year; Russia's "
        "withdrawal in 2023 forced exports onto Danube barges and rail "
        "until Ukraine's naval drones reopened a unilateral corridor.",
        "Negotiated corridors through blockades are hostage arrangements — "
        "plan for their collapse from the day they open.",
        ("wheat", "maize"), ("bosporus",),
    ),
    CrisisEvent(
        "vale-dams", "Vale dam disasters and the iron-ore squeeze", 2015, 2019,
        ("BRA",), "disaster",
        "The Samarco (2015) and Brumadinho (2019) tailings-dam collapses "
        "killed hundreds and forced Vale to idle a large share of Brazilian "
        "iron-ore capacity; seaborne ore prices spiked and safety reviews "
        "constrained supply for years.",
        "Industrial-safety failures at a top exporter act like export bans "
        "imposed from within — and the regulatory aftermath outlasts the "
        "repair.",
        ("iron_ore",),
        outcomes=(
            Outcome("Iron ore", "rose about 20% in the weeks after Brumadinho", "Jan – Feb 2019"),
        ),
    ),
    CrisisEvent(
        "aus-china-trade", "China's trade measures against Australia", 2020, 2023,
        ("AUS", "CHN"), "sanctions",
        "Informal bans hit Australian coal, barley, wine and lobster after "
        "political disputes; iron ore — the trade China could not replace — "
        "was conspicuously exempted, and most measures were quietly lifted "
        "within three years.",
        "Coercive trade measures reveal the coercer's dependencies by what "
        "they exempt — the untouchable import is the real map of leverage.",
        ("coal", "barley", "iron_ore"),
    ),
    CrisisEvent(
        "brexit-friction", "UK–EU post-Brexit friction", 2021, 2022,
        ("GBR",), "sanctions",
        "New customs borders with the EU cut UK trade intensity measurably; "
        "queues at Dover and paperwork, not tariffs, were the binding "
        "friction.",
        "Border formalities are a supply shock in slow motion — measured in "
        "hours of queue rather than percent of tariff.",
    ),
    CrisisEvent(
        "tanker-reflagging", "Tanker war reflagging operation", 1987, 1988,
        ("KWT", "USA", "IRN"), "war",
        "At the tanker war's peak the US reflagged Kuwaiti tankers under "
        "American colours and escorted convoys through Hormuz — the largest "
        "naval convoy operation since 1945.",
        "Flag-state protection is the escalation ladder's last commercial "
        "rung — after reflagging, the next step is naval war.",
        ("crude_oil",), ("hormuz",),
    ),
    CrisisEvent(
        "bangladesh-cyclone", "Cyclone Bhola and Bangladesh's independence war", 1970, 1971,
        ("BGD", "PAK"), "disaster",
        "The deadliest cyclone on record, a botched relief effort, and the "
        "ensuing independence war shattered the jute trade — then the "
        "region's dominant export — and created Bangladesh.",
        "Disaster response failures become political ruptures; the export "
        "economy is remade by the storm's politics, not its winds.",
    ),
    CrisisEvent(
        "great-leap", "Great Chinese Famine", 1959, 1961,
        ("CHN",), "drought",
        "Policy failure and weather produced the deadliest famine of the "
        "century; China swung from grain exporter to emergency importer, "
        "buying wheat from Canada and Australia despite the Cold War.",
        "Famine flips trade flows overnight: yesterday's exporter empties "
        "the same market it used to fill.",
        ("wheat",),
    ),
    CrisisEvent(
        "bengal-famine", "Bengal famine", 1943, 1944,
        ("IND", "BGD"), "war",
        "Wartime shipping priorities, the loss of Burmese rice imports and "
        "administrative failure produced a famine that killed millions in "
        "Bengal while grain moved elsewhere in the empire.",
        "In wartime, shipping allocation is life and death — famine can be "
        "a logistics decision, not a harvest outcome.",
        ("rice",),
    ),
    CrisisEvent(
        "north-korea-famine", "North Korean famine", 1994, 1998,
        ("PRK",), "drought",
        "The loss of Soviet subsidies, floods and systemic failure starved "
        "North Korea through the mid-1990s; the state's isolation turned a "
        "manageable shortfall into mass death.",
        "Autarky converts ordinary shocks into catastrophes — the refusal "
        "to trade is itself the vulnerability.",
    ),
    CrisisEvent(
        "polish-solidarity", "Polish crisis and martial law", 1980, 1983,
        ("POL",), "strike",
        "Strikes born in the Gdańsk shipyards, then martial law and Western "
        "sanctions, disrupted Polish coal exports — then Europe's largest — "
        "and its shipbuilding.",
        "Export industries breed the movements that shut them down — the "
        "docks and mines are where labour power concentrates.",
        ("coal",),
    ),
    CrisisEvent(
        "ukraine-holodomor", "Holodomor", 1932, 1933,
        ("UKR", "RUS"), "export_ban",
        "Soviet requisitioning exported Ukrainian grain through a famine "
        "that killed millions in the breadbasket itself.",
        "Grain can flow out of a starving exporter when the state wills "
        "it — export data alone never shows who is eating.",
        ("wheat",),
    ),
    CrisisEvent(
        "malacca-piracy", "Malacca piracy crisis", 2000, 2006,
        ("IDN", "MYS", "SGP"), "war",
        "Piracy in the strait peaked with hundreds of attacks; Lloyd's "
        "briefly rated Malacca a war-risk zone until coordinated littoral "
        "patrols suppressed the threat.",
        "Chokepoint security is a public good the littoral states must "
        "co-produce — insurance ratings force the cooperation navies "
        "wouldn't volunteer.",
        (), ("malacca",),
    ),
    CrisisEvent(
        "somali-piracy", "Somali piracy peak", 2008, 2012,
        ("SOM", "EGY"), "war",
        "Hijackings off the Horn of Africa peaked around 2011, taxing Suez "
        "routing with ransoms, armed guards and war-risk premiums until "
        "naval patrols and onboard security collapsed the business model.",
        "Piracy is a tax on a chokepoint's approaches — and the fix "
        "(armed guards, convoys) becomes permanent overhead.",
        (), ("suez", "bab_el_mandeb"),
    ),
    CrisisEvent(
        "sudan-sanctions", "US sanctions on Sudan", 1997, 2017,
        ("SDN",), "sanctions",
        "Two decades of US sanctions cut Sudan out of dollar trade and "
        "finance over Darfur and terrorism designations; oil development "
        "proceeded anyway, led by Chinese operators outside the sanctions "
        "net.",
        "A unilateral financial embargo redirects a resource economy toward "
        "whichever great power stays — sanctions choose the customer, not "
        "the outcome.",
        ("crude_oil",),
    ),
    CrisisEvent(
        "sudan-oil-split", "South Sudan secession and the oil shutdown", 2011, 2013,
        ("SDN", "SSD"), "revolution",
        "Secession left three-quarters of the oil in landlocked South Sudan "
        "and the only export pipeline in Sudan; a transit-fee dispute led "
        "Juba to shut its entire production for over a year.",
        "Partition can turn one export chain into two hostile halves — the "
        "wellhead and the port become mutual hostages.",
        ("crude_oil",),
    ),
    CrisisEvent(
        "sudan-civil-war", "Sudanese civil war", 2023, None,
        ("SDN",), "war",
        "War between the army and the RSF wrecked Khartoum, disputed Port "
        "Sudan's Red Sea coast, disrupted South Sudan's oil transit and cut "
        "exports of gum arabic — a Sudanese near-monopoly hidden inside most "
        "of the world's soft drinks.",
        "Niche near-monopolies hide three tiers deep in supply chains; the "
        "war reveals them when procurement teams start googling gum arabic.",
        ("crude_oil",), ("bab_el_mandeb",),
    ),
    CrisisEvent(
        "vietnam-war", "Vietnam War and the mining of Haiphong", 1964, 1975,
        ("VNM",), "war",
        "A decade of war devastated Vietnamese agriculture and trade; the "
        "1972 aerial mining of Haiphong harbour closed the North's main "
        "port overnight at trivial cost to the attacker.",
        "Mining a harbour is the cheapest blockade there is — closure by a "
        "single sortie, clearance by months of sweeping.",
        ("rice",),
    ),
    CrisisEvent(
        "uk-miners", "UK miners' strikes and the Three-Day Week", 1972, 1974,
        ("GBR",), "strike",
        "Coal strikes against a coal-fired grid forced Britain onto a "
        "three-day industrial week in early 1974 and brought down the "
        "government that imposed it.",
        "A strike in the energy sector is a national supply shock — the "
        "picket line reaches every factory on the grid.",
        ("coal",),
    ),
    CrisisEvent(
        "angola-civil-war", "Angolan civil war", 1975, 2002,
        ("AGO",), "war",
        "Twenty-seven years of civil war destroyed inland infrastructure "
        "and diamond regions, yet offshore oil production grew throughout — "
        "guarded enclaves exporting straight to tankers.",
        "Offshore enclaves can export through a civil war that razes "
        "everything onshore — geography of the wells decides what survives.",
        ("crude_oil",),
    ),
    CrisisEvent(
        "algeria-dark-decade", "Algerian civil war", 1992, 2002,
        ("DZA",), "war",
        "A decade of insurgency killed perhaps two hundred thousand, yet "
        "gas exports to Europe continued from militarized Saharan fields "
        "and coastal terminals — including through the 1990s expansion of "
        "the Maghreb pipelines.",
        "Hydrocarbon exports can be run as securitized islands inside a "
        "war — but every euro of that gas also funded one side of it.",
        ("lng",),
    ),
    CrisisEvent(
        "apartheid-sanctions", "Apartheid sanctions and disinvestment", 1985, 1991,
        ("ZAF",), "sanctions",
        "Trade sanctions and a disinvestment wave hit South African coal, "
        "steel and finance; the state doubled down on Sasol's coal-to-fuel "
        "synfuels, built precisely against oil embargoes.",
        "Long embargoes industrialize the target's workarounds — the "
        "substitution plants outlive the sanctions by decades.",
        ("coal",),
    ),
    CrisisEvent(
        "za-unrest-2021", "South African unrest and the Transnet cyberattack", 2021, 2021,
        ("ZAF",), "strike",
        "July riots closed the Durban port corridor, and a ransomware "
        "attack days later froze Transnet's container terminals nationwide "
        "— a double outage at the gateway for the region's minerals.",
        "Civil unrest and cyberattack hitting one logistics monopoly reveal "
        "that a country's entire trade can share a single point of failure.",
        ("coal",),
    ),
    CrisisEvent(
        "congo-wars", "Second Congo War", 1998, 2003,
        ("COD",), "war",
        "Africa's deadliest modern war drew in nine countries and was "
        "financed substantially by contested minerals — copper, cobalt, "
        "coltan — whose extraction continued through the fighting.",
        "Mineral wealth doesn't stop wars, it funds them — supply "
        "continuity and conflict finance can be the same flow.",
        ("cobalt",),
    ),
    CrisisEvent(
        "niger-delta", "Niger Delta militancy", 2006, 2009,
        ("NGA",), "war",
        "MEND attacks on pipelines and platforms shut in as much as a "
        "quarter of Nigerian oil output at the peak; an amnesty programme "
        "bought a fragile recovery that pipeline theft still erodes.",
        "Militias don't need to hold territory to cut supply — a wrench on "
        "a pipeline prices like a war, and the amnesty becomes a recurring "
        "ransom.",
        ("crude_oil", "lng"),
    ),
    CrisisEvent(
        "mexico-oil-1938", "Mexican oil expropriation", 1938, 1942,
        ("MEX",), "revolution",
        "Mexico nationalized the foreign oil majors; the companies' boycott "
        "of Mexican crude cut its exports until wartime demand and a US "
        "settlement reopened markets.",
        "The buyers' boycott is the standard answer to nationalization — "
        "Iran 1951 and Chile 1971 replayed this script.",
        ("crude_oil",),
    ),
    CrisisEvent(
        "bolivia-gas-wars", "Bolivian gas wars", 2003, 2005,
        ("BOL",), "revolution",
        "Plans to export gas through Chilean ports — the neighbour that "
        "took Bolivia's coast in 1879 — brought down two presidents and "
        "led to renationalization of the gas fields.",
        "An export route can be politically impossible even when it is the "
        "only economic one — historical grievance is infrastructure.",
        ("lng",),
    ),
    CrisisEvent(
        "civ-cocoa", "Ivorian post-election crisis and cocoa ban", 2010, 2011,
        ("CIV",), "export_ban",
        "The disputed election ended with the challenger ordering a cocoa "
        "export ban — a third of world supply — to starve the incumbent of "
        "revenue; EU port sanctions reinforced it until the standoff broke.",
        "In a contested state, the export crop is the treasury — whoever "
        "can stop it wins, so both sides will weaponize it.",
    ),
    CrisisEvent(
        "guinea-coup", "Guinean coup and the bauxite scare", 2021, 2022,
        ("GIN",), "revolution",
        "A coup in the supplier of a quarter of the world's bauxite — the "
        "ore behind aluminium — spiked alumina prices before the junta, "
        "dependent on mining revenue, kept shipments flowing.",
        "Coup plotters need the mine's revenue more than the old regime "
        "did — regime change often threatens supply less than markets "
        "price.",
        ("aluminium",),
        outcomes=(
            Outcome("Alumina", "rose about 10% within days of the coup before retracing", "Sep 2021"),
        ),
    ),
    CrisisEvent(
        "mozambique-lng", "Cabo Delgado insurgency and the LNG halt", 2021, 2024,
        ("MOZ",), "war",
        "An insurgent attack on Palma forced TotalEnergies to declare force "
        "majeure on a $20bn LNG project days after financing closed; the "
        "capacity markets had penciled in for mid-decade slipped by years.",
        "Insurgency doesn't just cut supply — it deletes future capacity "
        "that price curves had already assumed.",
        ("lng",),
    ),
    CrisisEvent(
        "tigray-war", "Tigray war and blockade", 2020, 2022,
        ("ETH", "ERI"), "war",
        "War in northern Ethiopia included an effective aid and commerce "
        "blockade of Tigray for over a year; sesame and coffee exports fell "
        "and famine conditions returned to the region of the 1980s crisis.",
        "Internal blockades repeat with the same geography a generation "
        "apart — the roads that starved a region once can do it again.",
    ),
    CrisisEvent(
        "western-sahara", "Green March and the Western Sahara war", 1975, 1991,
        ("MAR",), "war",
        "Morocco annexed Western Sahara and its Bou Craa phosphate mine; "
        "Polisario sabotage cut the conveyor to the coast repeatedly, and "
        "the territory's phosphates remain under disputed sovereignty.",
        "Reserve concentration under disputed sovereignty is a permanent "
        "supply question — every buyer of the ore buys the dispute.",
        ("phosphate_fertilizer",),
    ),
    CrisisEvent(
        "india-pl480", "India's ship-to-mouth years", 1965, 1967,
        ("IND", "USA"), "drought",
        "Back-to-back monsoon failures left India dependent on US PL-480 "
        "wheat shipments that Washington rationed monthly for diplomatic "
        "leverage; the humiliation launched the Green Revolution.",
        "Food aid is leverage, and recipients know it — dependence this "
        "sharp gets answered with a national self-sufficiency program.",
        ("wheat",),
    ),
    CrisisEvent(
        "pakistan-floods", "Pakistan superfloods", 2022, 2023,
        ("PAK",), "disaster",
        "Monsoon floods submerged a third of the country, destroying "
        "cotton and rice crops, while reserve exhaustion made LNG cargoes "
        "unaffordable at war-inflated prices — a climate and balance-of-"
        "payments crisis compounding.",
        "Climate disaster plus a weak currency is Sri Lanka's lesson at "
        "scale — the flood decides what's lost, the reserves decide what "
        "can be replaced.",
        ("rice", "lng"),
    ),
    CrisisEvent(
        "argentina-export-taxes", "Argentina's export-restriction era", 2006, 2015,
        ("ARG",), "export_ban",
        "Recurring export taxes, quotas and outright bans on wheat, maize "
        "and beef — meant to hold down domestic prices — shrank plantings "
        "and forfeited Argentina's rank among wheat exporters for a decade.",
        "Taxing the export crop is eating the seed corn: the world market "
        "share, once surrendered, is bought by competitors for good.",
        ("wheat", "maize", "soybeans"),
    ),
    CrisisEvent(
        "brazil-truckers", "Brazilian truckers' strike", 2018, 2018,
        ("BRA",), "strike",
        "A ten-day national truckers' strike over diesel prices paralyzed "
        "soy, grain and meat exports, emptied supermarket shelves and "
        "grounded flights — in a country whose freight is overwhelmingly "
        "road-borne.",
        "A commodity superpower with one freight mode has one strike "
        "between it and stoppage — modal concentration is chokepoint risk "
        "on land.",
        ("soybeans", "maize"),
    ),
    CrisisEvent(
        "mississippi-drought", "Mississippi River low-water crisis", 2022, 2023,
        ("USA",), "drought",
        "Record low water halved barge drafts on the river that carries "
        "most US grain exports to the Gulf just as harvest peaked; freight "
        "rates spiked several-fold and fertilizer moved upstream late.",
        "A river is infrastructure with no backup — when the water level "
        "is the constraint, no investment fixes this season.",
        ("maize", "soybeans"),
        outcomes=(
            Outcome("Barge freight (St. Louis)", "spiked to several times the seasonal norm at harvest peak", "Sep – Oct 2022"),
        ),
    ),
    CrisisEvent(
        "rhine-drought", "Rhine low-water crisis", 2022, 2022,
        ("DEU", "CHE", "NLD"), "drought",
        "Drought cut Rhine barge loads to a fraction in the middle of the "
        "energy crisis, strangling coal deliveries to power plants and "
        "chemical feedstocks along Europe's industrial artery.",
        "Climate stress finds the oldest infrastructure first — Europe's "
        "industrial heart still runs on a river's water level.",
        ("coal",),
    ),
    CrisisEvent(
        "china-power-crunch", "China's power crunch", 2021, 2021,
        ("CHN",), "export_ban",
        "Coal shortages and emissions targets forced rolling industrial "
        "power cuts; energy-hungry aluminium and magnesium output fell, "
        "and Europe's carmakers discovered China smelts most of the "
        "world's magnesium.",
        "Power rationing in the world's factory is an export ban nobody "
        "announced — the shortage arrives basket by basket downstream.",
        ("coal", "aluminium"),
        outcomes=(
            Outcome("Magnesium", "roughly quintupled as smelters idled, alarming European carmakers", "Sep – Oct 2021"),
        ),
    ),
)

BY_KEY: dict[str, CrisisEvent] = {e.key: e for e in EVENTS}


def for_country(iso3: str) -> list[CrisisEvent]:
    """Every curated event that involved the country, oldest first."""
    return sorted(
        (e for e in EVENTS if iso3 in e.countries),
        key=lambda e: e.year_start,
    )


def analogues(
    countries: tuple[str, ...] = (),
    baskets: tuple[str, ...] = (),
    chokepoints: tuple[str, ...] = (),
    limit: int = 5,
) -> list[CrisisEvent]:
    """The reference class for a hypothetical: past events that rhyme.

    Scoring is deliberately simple and inspectable — country overlap counts
    most (same place, same politics), chokepoint overlap next (same
    geography), basket overlap least (same commodity, any geography).
    Recency breaks ties: the analyst wants the rhyme they lived through
    before the one their grandparents did.
    """
    basket_set, country_set, choke_set = set(baskets), set(countries), set(chokepoints)
    scored: list[tuple[float, CrisisEvent]] = []
    for e in EVENTS:
        score = (
            3.0 * len(country_set & set(e.countries))
            + 2.0 * len(choke_set & set(e.chokepoints))
            + 1.0 * len(basket_set & set(e.baskets))
        )
        if score > 0:
            scored.append((score + e.year_start / 10_000, e))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [e for _, e in scored[:limit]]

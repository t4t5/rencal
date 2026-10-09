# Mikado graph: quick-add parser in the user's language

```
GOAL  Quick-add and "Go to date" understand the user's language (German first)
├── [x] A  Characterization tests pin today's English behaviour
├── [x] B  ParserVocabulary: chrono instance + recurrence/location/connector words
│   └── [x] B1 English vocabulary extracted, parser runs on it (tests unchanged, green)
├── [ ] C  German vocabulary (chrono.de, jeden/jede/jedes …, montags, werktags, um/am/vom)
├── [ ] D  Active language first, English as fallback (mixed input keeps working)
│   └── [ ] D1 locale activation tells the parser the language (activator followers)
└── [ ] E  German examples in the catalog ("Meeting morgen um 15 Uhr", "nächsten Sonntag")

Found on the way, not changed: "Party from 8pm to 11pm saturday" ends a week late;
the time after a recurring weekday is not highlighted.
```

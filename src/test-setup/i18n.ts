import { i18n } from "@lingui/core"

// Tests assert on the English source text, so they run with an empty English
// catalog: Lingui then renders every message as written in the code.
i18n.loadAndActivate({ locale: "en", messages: {} })

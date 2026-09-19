// ============================================================================
// CHART LIBRARY — every chart offered in the app's left sidebar.
//
// Each entry is one chart, inserted onto a page with its content already filled in.
// Order here is the sidebar order (entries with a `group` are listed first, under that heading).
// Rows the user types in the app are saved in the browser and are NOT changed by edits here.
//
// Fields:
//   key      unique id. NEVER change an existing key — saved pages use it to show a chart as in use.
//            New charts: any new unique text, e.g. "finance:3" or "waste:0".
//   group    optional Dhivehi heading the chart is listed under (e.g. "ބަޖެޓް ޗާރޓް").
//   name     optional sidebar name; only needed when the chart has no heading.
//   type     money | progress | bars | tiles | cards | grid | list
//              money     — money breakdown with a total. Options: style ('stacked' | 'bars' | 'waffle'), totalLabel
//              progress  — budget used: row 1 = total, row 2 = amount used
//              bars      — horizontal bars for counts
//              tiles     — stat tiles with a thin bar. Option: cols (2, or auto)
//              cards     — one card per row: label + big number
//              grid      — cards side by side. Options: cols (2 or 3), subheading
//              list      — one panel, one line per row with a large label (for many rows)
//   heading  the chart's Dhivehi heading (also its sidebar name)
//   box      optional starting position/size { x, y, w, h } in px inside the card. Usually left out:
//            the chart places itself, and the user moves/resizes it on the page.
//   colors   optional: 'deep' | 'teal' | 'mid' | 'light' | 'ink' | 'pale' (default cycles deep, teal, mid, light)
//   rows     [ ['label', number], … ] — a row may add an icon: ['label', number, 'houses']
//            (icons: 'house-person', 'houses', 'road', 'bin', 'people', 'man', 'woman', 'sheikh', 'dua'; the grid chart draws icon rows as stat panels,
//            the cards chart as an icon tile at the card's right edge)
//
// Council name (for a header, if one ever returns): ތިލަދުންމަތީ އުތުރުބުރީ ހއ. ދިއްދޫ ކައުންސިލްގެ އިދާރާ
// ============================================================================

window.CHART_LIBRARY = [
  {
    key: "finance:0",
    group: "ބަޖެޓް ޗާރޓް",
    type: "money",
    style: "stacked",
    totalLabel: "ޖުމްލަ",
    heading: "ބަޖެޓް",
    colors: ["deep","mid","light"],
    rows: [
      ["ދައުލަތުން ދޭ ބްލޮކް ގްރާންޓް ", 100],
      ["ކައުންސިލްގެ އާމްދަނީ", 50],
      ["އަންހެނުންގެ ކޮމިޓީގެ ފައިސާ", 50],
    ],
  },
  {
    key: "finance:1",
    group: "ބަޖެޓް ޗާރޓް",
    type: "money",
    style: "stacked",
    totalLabel: "ޖުމްލަ",
    heading: "ޚަރަދު",
    colors: ["deep","light"],
    rows: [
      ["ރިކަރަންޓް ޚަރަދު", 150],
      ["ކެޕިޓަލް ޚަރަދު", 50],
    ],
  },
  {
    key: "legal:0",
    group: "ލީގަލް ޗާރޓް",
    type: "bars",
    heading: "ލީގަލް މަސައްކަތްތައް",
    rows: [
      ["ޑްރާފްޓް މަރުޙަލާގައިވާ ގަވާއިދުތަކުގެ އަދަދު", 20],
      ["ރިވިއު ކުރެވުނު ގަވާއިދުތަކުގެ އަދަދު", 10],
      ["ރިވިއު ކުރެވުނު އުޞޫލުތަކުގެ އަދަދު", 15],
      ["ތައްޔާރުކުރެވިފައިވާ އެއްބަސްވުންތަކުގެ އަދަދު", 10],
      ["އެއްބަސްވުންތަކަށް ގެނެވުނު އިސްލާޙުތަކުގެ އަދަދު", 5],
      ["ރިޓެއިނާ ލޯފާމުގެ ލަފާ ހޯދަމުންދާ ކަންކަމުގެ އަދަދު", 5],
      ["ލީގަލް އޮޕީނިއަން / ރިސަރޗް", 20],
      ["މުވައްޒަފުންނާ ހިއްސާކުރެވުނު ޤާނޫނު / ޤަވާއިދު / އުޞޫލު", 10],
    ],
  },
  {
    key: "legal:1",
    group: "ލީގަލް ޗާރޓް",
    type: "bars",
    heading: "ކޯޓު މަރުޙަލާގައިވާ މައްސަލަތައް",
    rows: [
      ["ކޯޓަށް ހުށަހެޅުނު މައްސަލަތައް", 5],
      ["ކޯޓުގައި ކުރިއަށްދާ މައްސަލަތައް", 15],
      ["ޙުކުމްކުރެވުނު މައްސަލަތައް", 10],
      ["ތައްޔާރުކުރެވުނު ދައުވާ ފޯމުތައް", 5],
    ],
  },
  {
    key: "bid:0",
    group: "ބީލަން ޗާރޓް",
    type: "tiles",
    cols: 2,
    // Heading given by the user on 2026-09-19 (typed in chat, used verbatim).
    heading: "ބީލަންތައް",
    colors: ["deep","teal","ink","mid","deep","light","teal","mid"],
    rows: [
      ["ޕްރޮސެސްކުރި ބިލުގެ އަދަދު", 100],
      ["ބިޑް ކޮމިޓީ ބައްދަލުވުންތަކުގެ އަދަދު", 20],
      ["އޯޕަން ކުރި ބީލަންތަކުގެ އަދަދު", 5],
      ["ސޮއިކުރި ބީލަމާއި ގުޅޭ އެއްބަސްވުންތައް", 10],
      ["އެވޯޑްކުރި ބީލަންތަކުގެ އަދަދު", 15],
      ["އިޢުލާންކުރި ބީލަންތަކުގެ އަދަދު", 50],
      ["ސޮއިކުރި ވޭރިއޭޝަން އެއްބަސްވުންތަކުގެ އަދަދު", 25],
      ["ވޭރިއޭޝަންސްއަށް ހުއްދަ ދެވުނު އެއްބަސްވުންތަކުގެ އަދަދު", 15],
    ],
  },
  {
    key: "bid:1",
    group: "ބީލަން ޗާރޓް",
    type: "tiles",
    heading: "35،000ރ އިން ދަށުގެ ޕްރޮކިއުމަންޓް",
    rows: [
      ["ޕްރޮސެސްކުރި ބިލުގެ އަދަދު", 20],
      ["ތައްޔާރުކުރި ޖުމްލަ ޕީއޯތަކުގެ އަދަދު", 100],
      ["ސޮއިކުރި އެއްބަސްވުންތަކުގެ އަދަދު", 105],
    ],
  },
  {
    key: "finance2:0",
    group: "ބަޖެޓް ޗާރޓް",
    type: "progress",
    heading: "ބަޖެޓުން ޚަރަދު ކުރެވިފައިވާ އިންސައްތަ",
    rows: [
      ["ޖުމްލަ ބަޖެޓް", 152510000],
      ["މިމަހުގެ ނިޔަލަށް ކުރެވިފައިވާ ޖުމްލަ ޚަރަދު", 52000000],
    ],
  },
  {
    key: "finance2:1",
    group: "ބަޖެޓް ޗާރޓް",
    type: "money",
    style: "stacked",
    totalLabel: "ޖުމްލަ",
    heading: "މަހުގެ އާމްދަނީ",
    colors: ["deep","mid","ink","light"],
    rows: [
      ["ކުލީގެ ގޮތުގައި ލިބުނު އާމްދަނީ", 500000],
      ["އެހެނިހެން ގޮތްގޮތުން ލިބުނު އާމްދަނީ", 100000],
      ["ފައިނޭސިންގ ސްކީމުން އަނބުރާ ލިބުން ފައިސާ", 250000],
      ["ޚިދުމަތްތަކުން ނެގި ފީގެގޮތުގައި ލިބުނު އާމްދަނީ", 50000],
    ],
  },
  {
    key: "finance3:0",
    group: "ބަޖެޓް ޗާރޓް",
    // Added 2026-09-19 from the user's image; heading typed by the user. Labels transcribed from the
    // image and compared in Faruma (least certain: row 1 "ކޮންޓްރޯލްތަކުގެ", row 2 "ދެއްކި").
    // The user asked for a different design than the image's red bars: a 2 x 2 card grid.
    type: "grid",
    cols: 2,
    heading: "އެހެނިހެން މާލީ ތަފާސްހިސާބު",
    colors: ["deep","teal","ink","mid"],
    rows: [
      ["ތައްޔާރުކުރި ބަޖެޓް ކޮންޓްރޯލްތަކުގެ އަދަދު", 8],
      ["ފައިސާ ދެއްކި ބިލުތަކުގެ އަދަދު", 107],
      ["ތައްޔާރުކުރި ރަސީދުގެ އަދަދު", 270],
      ["ދޫކުރި އިންވޮއިސްގެ އަދަދު", 42],
    ],
  },
  {
    key: "support:0",
    group: "ފޯރުކޮށްދިން އެހީ ޗާރޓް",
    // support:0 and support:1 combined into one chart at the user's request (2026-09-19).
    type: "cards",
    // Heading set by the user on 2026-09-19 (transcribed from their screenshot, compared in Faruma).
    heading: "ނާޒުކު ހާލަތުގައި ފަރާތްތަކަށް އެހީތެރިކަން ފޯރުކޮށްދިނުން",
    colors: ["deep","teal","mid","light","ink","deep","teal","mid"],
    rows: [
      ["ހާލުބަލާފައިވާ ފަރާތްތަކުގެ އަދަދު", 7],
      ["ފަޤީރު ޙާލުގައި ދިރިއުޅޭ އެކަނި ދަރިން ބަލަހައްޓާ މައިން ނުވަތަ ބަފައިންނަށް ދެވޭ މާލީ އެހީ ހޯދުމަށް އެހީތެރިކަން ފޯރުކޮށްދެވުނު ފަރާތްތަކުގެ އަދަދު", 10],
      ["ނުކުޅެދުންތެރިކަން ހުންނަ ފަރާތްތަކަށް ސަރުކާރުން ފޯރުކޮށްދޭ ޚިދުމަތްތައް ހޯދުމަށް އެހީތެރިކަން ފޯރުކޮށްދެވުނު ފަރާތްތަކުގެ އަދަދު", 15],
      ["65 އަހަރުން މަތީގެ ފަރާތްތަކަށް ދޭ އަސާސީ ޕެންޝަން ހޯދުމަށް އެހީތެރިކަން ފޯރުކޮށްދެވުނު އަދަދު", 20],
      ["އުމުރުން ދުވަސްވީ މީހުންގެ ދަފްތަރުގައި އަލަށް ޖެހުނު ފަރާތްތަކުގެ އަދަދު", 25],
      ["ނުކުޅެދުންތެރިކަން ހުންނަ ފަރާތްތަކުގެ ދަފްތަރުގައި އަލަށް ޖެހުނު ފަރާތްތަކުގެ އަދަދު", 10],
      ["ފަޤީރުންގެ ދަފްތަރުގައި އަލަށް ޖެހުނު ފަރާތްތަކުގެ އަދަދު", 25],
      ["އެކަނިވެރި މައިން / ބަފައިންގެ ދަފްތަރުގައި އަލަށް ޖެހުނު ފަރާތްތަކުގެ އަދަދު", 20],
    ],
  },
  {
    key: "municipal:0",
    group: "ކަށުކަމާކެމީގެ ޗާރޓް",
    type: "cards",
    heading: "ކަށުކަމާކެމީގެ އިންތިޒާމުތައް ހަމަޖެއްސުން ",
    rows: [
      ["ކަށުކަމާކެމީގެ އިންތިޒާމު ހަމަޖައްސައިދެވުނު އަދަދު", 8],
    ],
  },

  {
    key: "municipal:2",
    group: "ފޯރުކޮށްދޭ ޚިދުމަތްތަކުގެ ޗާރޓް",
    type: "grid",
    cols: 3,
    // Renamed by the user on 2026-09-19 (was "މުނިސިޕަލް ޙިދުމަތްތައް").
    heading: "ގޯތިގެދޮރާއި ގުޅޭ ޚިދުމަތްތައް",
    colors: ["ink","deep","teal","mid","deep","ink"],
    rows: [
      ["ކޯޓުން ގޯތީގެ މަޢުލޫމާތު ސާފުކުރުމަށް އަންނަ ސިޓީގެ ޖަވާބު ދެވުނު އަދަދު", 21],
      ["ޕާޓިޝަން ޖެހުމުގެ ހުއްދަ ދޫކުރެވިފައިވާ އަދަދު", 12],
      ["އިންފާރާއި ގުޅޭ ހުއްދަ ދޫކުރެވިފައިވާ އަދަދު", 5],
      ["ގޯތި ބައިކޮށް އިންވަކިކުރެވިފައިވާ އަދަދު", 2],
      ["ގޯތީގެ ރަޖިސްޓަރީ ހައްދާދެވިފައިވާ އަދަދު", 1],
      ["ގޯތީގެ މިން ބެލުމަށް އެދޭ ގޯތިތަށް ސާރވޭކޮށް ޗާޓު ކުރެހުން", 1],
      // Stat panels (rows with an icon draw above the cards). Added 2026-09-19: labels typed by the
      // user, numbers from the user's reference image.
      ["މީހުން ދިރިއުޅޭ ގޯތީގެ އަދަދު", 2396, "house-person"],
      ["ގޯތީގެ ޖުމްލަ އަދަދު", 3123, "houses"],
    ],
  },
  {
    key: "rahvehi:0",
    group: "ފޯރުކޮށްދޭ ޚިދުމަތްތަކުގެ ޗާރޓް",
    type: "bars",
    heading: "ރަށްވެހިކަމުގެ ޚިދުމަތްތައް",
    rows: [
      ["އުފަންދުވަހުގެ ސެޓްފިކެޓް ހައްދާފައިވާ އަދަދު", 16],
      ["އުފަންދުވަހުގެ ރަޖިސްޓްރީ ހައްދާފައިވާ އަދަދު", 13],
      ["ދިވެހި ރައްޔިތެއްކަން އަންގައިދޭ ކާޑުހެއްދުމަށް ހުށައެޅުން އަދަދު", 31],
      // Row 4 corrected by the user on 2026-09-19 (was "ރަށްވެހިންގެ ރަޖިސްޓްރީ އާކުރެވުނު އަދަދު/ ގެއްލިގެން", 13).
      ["ރަށްވެހިންގެ ރަޖިސްޓްރީ ގެއްލިގެން އާކުރެވުނު އަދަދު", 55],
      ["ރަށުގައި ނިޔާވި އަދި ކަށުކަމާކުމީގެ އިންތިޒާމު ހަމަޖައްސައި ދެވުން މީހުންގެ އަދަދު", 7],
      // Row 6 added by the user on 2026-09-19 (first word confirmed by the user).
      ["ރަށްވެހިންގެ ރަޖިސްޓްރީ އަލަށް ހެއްދުނު އަދަދު", 0],
    ],
  },

  {
    key: "complaints:0",
    group: "އާންމު ޝަކުވާތަކުގެ ޗާރޓް",
    // Added 2026-09-20 from the user's image (heading, labels and numbers transcribed and compared in
    // Faruma). Row 2 was then corrected by the user (typed in chat; its accidental double space made single). Group name typed by the user.
    type: "cards",
    heading: "އާއްމު ޝަކުވާގެ މައްސަލަތައް",
    rows: [
      ["މަގުތަކުގައި ތަކެތި ބެހެއްޓުމާއި ގުޅޭ ޝަކުވާގެ މައްސަލަތައް", 85, "road"],
      ["ގޯއްޗާއި ގޯތި ގުޅިފައިވާ މަގުތައް ސާފުނުކުރުމާއި ގުޅޭ ޝަކުވާގެ މައްސަލަތައް", 6, "bin"],
    ],
  },
  {
    key: "municipal:1",
    group: "އެހެނިހެން ޗާރޓް",
    type: "cards",
    // Heading given by the user on 2026-09-19 (typed in chat, used verbatim; was "ޤައުމިއްޔަތު").
    heading: "އެޑްމިނިސްޓްރޭޝަންގެ މަސައްކަތްތައް",
    colors: ["ink","teal"],
    rows: [
      ["މަގުބައްތިތަކަށް ދިމާވި މައްސަލަތަކަށް އެޓެންޑް ވެވުނު އަދަދު", 50],
      ["މައުލޫމާތު ހޯދައި ލިބިގަތުމުގެ ހައްޤުގެ ދަށުން ޖަވާބު ފޯރުކޮއްދެވުނު އަދަދު", 10],
      // Row 3 added by the user on 2026-09-19 (3rd word spelled by the user: ޙާއްސަ).
      ["ފާހަގަ ކޮށްފައިވާ ޙާއްސަ ދުވަސްތަކުގެ އަދަދު", 5],
    ],
  },  {
    key: "rahvehi:1",
    group: "އެހެނިހެން ޗާރޓް",
    type: "cards",
    heading: "ކައުންސިލްގެ ވަސީލަތްތައް ބޭނުންކުރުން",
    colors: ["ink","teal"],
    rows: [
      ["މުއައްސަސާ/ ކުލަބް ޖަމިއްޔާތަކަށް އަނބުރާ ރައްދު ކުރާގޮތަށް ތަކެތި ދޫކުރެވުނު އަދަދު", 15],
      ["ކޯޑިނޭޓްކޮށްދީފައިވާ ދަތުރުތަކުގެ އަދަދު (ރަށުން ބޭރުން އަންނަ މީހުންގެ)", 3],
    ],
  },  {
    key: "population:0",
    group: "އެހެނިހެން ޗާރޓް",
    // Added 2026-09-20 from the user's image (heading, labels and numbers transcribed and compared in
    // Faruma). Group name typed by the user. Three stat panels, read right to left: total, men, women.
    // Labels and numbers updated from the user's screenshot of their edited chart, 2026-09-20.
    type: "grid",
    cols: 3,
    heading: "އާބާދީގެ ހިސާބު",
    colors: ["ink","deep","teal"],
    rows: [
      ["ޖުމްލަ", 4566, "people"],
      ["ފިރިހެނުން", 2316, "man"],
      ["އަންހެނުން", 2250, "woman"],
    ],
  },
  {
    key: "religion:0",
    group: "އެހެނިހެން ޗާރޓް",
    // Added 2026-09-20: heading and both labels typed by the user in chat (verbatim), numbers from the
    // user's image. Icons: the user's own read-quran picture for row 1 (was the drawn sheikh), the user's islam picture for row 2 (was the drawn dua hands).
    type: "cards",
    heading: "ދީނީ ހޭލުންތެރިކަން އިތުރުކުރުން",
    rows: [
      ["މިސްކިތްތަކުގައި ދީނީ ފޮތް އުނގަންނައި ދިނުމުގެ ޕްރޮގްރާމް ކުރިއަށް ގެންދިޔަ އަދަދު", 18, "read-quran"],
      ["ދީނީ ދަރުސް ދީފައިވާ އަދަދު", 8, "islam"],
    ],
  },
  {
    key: "building:0",
    group: "ފޯރުކޮށްދޭ ޚިދުމަތްތަކުގެ ޗާރޓް",
    type: "list",
    heading: "އިމާރާތްކުރުމާއިގުޅޭ ޚިދުމަތްތައް",
    colors: ["ink","deep","teal","mid"],
    rows: [
      ["އެއްބުރިޔަށް އިމާރާތްކުރުމުގެ ހުއްދަ", 0],
      ["އިމާރާތުގެ ކުރެހުން ފާސްކުރުން", 0],
      ["އެއްބުރިޔަށްވުރެ އުސްކޮށް އިމާރާތްކުރުމުގެ ހުއްދަ", 0],
      ["ވަކިކަމަކަށް އިމާރާތްކުރުމުގެ ހުއްދަ", 0],
      // Row 5 added by the user on 2026-09-19 (text typed in chat, verbatim).
      ["އިމާރާތާއި އިންފާރު ތެޅުމުގެ ހުއްދަ", 0],
    ],
  },
  {
    key: "building:1",
    group: "ފޯރުކޮށްދޭ ޚިދުމަތްތަކުގެ ޗާރޓް",
    type: "list",
    heading: "ދަތުރުފަތުރާއިގުޅޭ ޚިދުމަތްތައް",
    colors: ["ink","deep","teal","mid"],
    rows: [
      ["ގަރާޖު ހުއްދަ ދޫކުރެވިފައިވާ އަދަދު", 0],
      ["ކަނޑު އުޅަނދުގެ ސީވާރދިނަސް އާއި ބެހޭ ސެޓްފިކެޓް ދޫކުރެވިފައިވާ އަދަދު", 0],
      ["ފަސިންޖަރުން އުފުލުމުގެ ސެޓްފިކެޓް ދޫކުރެވިފައިވާ އަދަދު", 0],
      ["ބަރުމަރުކާ ސެޓްފިކެޓް ދޫކުރެވިފައިވާ އަދަދު", 0],
    ],
  },
  {
    key: "building:2",
    group: "ފޯރުކޮށްދޭ ޚިދުމަތްތަކުގެ ޗާރޓް",
    type: "list",
    heading: "އާންމު ޚިދުމަތްތައް",
    colors: ["ink","deep","teal","mid"],
    rows: [
      ["މަގުކޮނުމަށްޓަކައި ދޫކުރެވިފައިވާ ހުއްދަ", 0],
      ["މަގު ބަންދުކުރުމަށް ދޫކުރެވިފައިވާ ހުއްދަ", 0],
      ["މަގުމަތީގައި ތަކެތި ބެހެއްޓުމަށް ދޫކުރެވިފައިވާ ހުއްދަ", 0],
      ["އޮޑިއެހެލުމަށް ދޫކުރެވިފައިވާ ހުއްދަ", 0],
    ],
  },
];

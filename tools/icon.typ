// PWA 图标生成源文件。
//
// 用法（由 scripts 或手动执行）：
//   typst compile --font-path <noto-cjk> --format png --ppi 254 tools/icon.typ public/pwa-512.png
//   typst compile --font-path <noto-cjk> --format png --ppi 95.25 tools/icon.typ public/pwa-192.png
//
// 页面 5.12 cm 见方：254 ppi → 512 px，95.25 ppi → 192 px。

#set page(width: 5.12cm, height: 5.12cm, margin: 0pt, fill: rgb("#1a5fb4"))

#place(center + horizon, dy: -0.32cm)[
  #text(font: "Noto Sans CJK SC", size: 30pt, weight: "bold", fill: white)[WES]
]

#place(center + horizon, dy: 0.30cm)[
  #text(font: "Noto Sans CJK SC", size: 7.5pt, fill: rgb("#cfe2ff"))[
    SL 253-2018
  ]
]

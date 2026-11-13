graph [
  directed 1
  node [
    id 0
    label "U"
    name "U"
    role "latent"
    graphics [
      x 198
      y -72
    ]
  ]
  node [
    id 1
    label "L"
    name "L"
    role "adjusted"
    graphics [
      x 48
      y 8
    ]
  ]
  node [
    id 2
    label "E"
    name "E"
    role "exposure"
    graphics [
      x 48
      y 148
    ]
  ]
  node [
    id 3
    label "D"
    name "D"
    role "outcome"
    graphics [
      x 348
      y 148
    ]
  ]
  edge [
    source 0
    target 1
  ]
  edge [
    source 1
    target 2
  ]
  edge [
    source 0
    target 3
  ]
  edge [
    source 2
    target 3
  ]
]

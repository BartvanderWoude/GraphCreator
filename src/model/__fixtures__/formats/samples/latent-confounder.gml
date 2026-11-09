graph [
  directed 1
  node [
    id 0
    label "U"
    name "U"
    role "latent"
    graphics [
      x 182
      y -88
    ]
  ]
  node [
    id 1
    label "L"
    name "L"
    role "adjusted"
    graphics [
      x 32
      y -8
    ]
  ]
  node [
    id 2
    label "E"
    name "E"
    role "exposure"
    graphics [
      x 32
      y 132
    ]
  ]
  node [
    id 3
    label "D"
    name "D"
    role "outcome"
    graphics [
      x 332
      y 132
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

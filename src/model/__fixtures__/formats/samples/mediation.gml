graph [
  directed 1
  node [
    id 0
    label "E"
    name "E"
    role "exposure"
    graphics [
      x 32
      y 132
    ]
  ]
  node [
    id 1
    label "M"
    name "M"
    role "adjusted"
    graphics [
      x 182
      y 32
    ]
  ]
  node [
    id 2
    label "D"
    name "D"
    role "outcome"
    graphics [
      x 332
      y 132
    ]
  ]
  node [
    id 3
    label "C"
    name "C"
    graphics [
      x 332
      y -18
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
    target 2
  ]
  edge [
    source 3
    target 1
  ]
  edge [
    source 3
    target 2
  ]
]

graph [
  directed 1
  node [
    id 0
    label "E"
    name "E"
    role "exposure"
    graphics [
      x 48
      y 148
    ]
  ]
  node [
    id 1
    label "M"
    name "M"
    role "adjusted"
    graphics [
      x 198
      y 48
    ]
  ]
  node [
    id 2
    label "D"
    name "D"
    role "outcome"
    graphics [
      x 348
      y 148
    ]
  ]
  node [
    id 3
    label "C"
    name "C"
    graphics [
      x 348
      y -2
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

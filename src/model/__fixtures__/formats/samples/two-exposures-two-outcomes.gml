graph [
  directed 1
  node [
    id 0
    label "C"
    name "C"
    graphics [
      x 48
      y -52
    ]
  ]
  node [
    id 1
    label "B"
    name "B"
    role "adjusted"
    graphics [
      x 348
      y -52
    ]
  ]
  node [
    id 2
    label "E1"
    name "E1"
    role "exposure"
    graphics [
      x 48
      y 48
    ]
  ]
  node [
    id 3
    label "E2"
    name "E2"
    role "exposure"
    graphics [
      x 198
      y 148
    ]
  ]
  node [
    id 4
    label "D1"
    name "D1"
    role "outcome"
    graphics [
      x 348
      y 48
    ]
  ]
  node [
    id 5
    label "D2"
    name "D2"
    role "outcome"
    graphics [
      x 348
      y 198
    ]
  ]
  edge [
    source 0
    target 2
  ]
  edge [
    source 0
    target 4
  ]
  edge [
    source 2
    target 4
  ]
  edge [
    source 2
    target 3
  ]
  edge [
    source 3
    target 5
  ]
  edge [
    source 1
    target 3
  ]
  edge [
    source 1
    target 5
  ]
]

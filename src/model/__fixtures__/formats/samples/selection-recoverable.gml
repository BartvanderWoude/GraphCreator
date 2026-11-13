graph [
  directed 1
  node [
    id 0
    label "A"
    name "A"
    graphics [
      x 48
      y -52
    ]
  ]
  node [
    id 1
    label "C"
    name "C"
    graphics [
      x 198
      y -72
    ]
  ]
  node [
    id 2
    label "E"
    name "E"
    role "exposure"
    graphics [
      x 48
      y 98
    ]
  ]
  node [
    id 3
    label "D"
    name "D"
    role "outcome"
    graphics [
      x 348
      y 98
    ]
  ]
  node [
    id 4
    label "S"
    name "S"
    role "selected"
    graphics [
      x -102
      y -52
    ]
  ]
  edge [
    source 2
    target 3
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
    source 1
    target 2
  ]
  edge [
    source 1
    target 3
  ]
]

graph [
  directed 1
  node [
    id 0
    label "E"
    name "E"
    role "exposure"
    graphics [
      x 48
      y 48
    ]
  ]
  node [
    id 1
    label "D"
    name "D"
    role "outcome"
    graphics [
      x 348
      y 48
    ]
  ]
  node [
    id 2
    label "S"
    name "S"
    role "selected"
    graphics [
      x 198
      y 168
    ]
  ]
  node [
    id 3
    label "C"
    name "C"
    graphics [
      x 348
      y 168
    ]
  ]
  edge [
    source 0
    target 1
  ]
  edge [
    source 0
    target 2
  ]
  edge [
    source 3
    target 2
  ]
  edge [
    source 3
    target 1
  ]
]

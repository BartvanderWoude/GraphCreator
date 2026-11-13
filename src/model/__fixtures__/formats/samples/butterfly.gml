graph [
  directed 1
  node [
    id 0
    label "A"
    name "A"
    graphics [
      x 48
      y 48
    ]
  ]
  node [
    id 1
    label "B"
    name "B"
    graphics [
      x 348
      y 48
    ]
  ]
  node [
    id 2
    label "M"
    name "M"
    graphics [
      x 198
      y 128
    ]
  ]
  node [
    id 3
    label "E"
    name "E"
    role "exposure"
    graphics [
      x 48
      y 208
    ]
  ]
  node [
    id 4
    label "D"
    name "D"
    role "outcome"
    graphics [
      x 348
      y 208
    ]
  ]
  edge [
    source 0
    target 2
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
    source 1
    target 4
  ]
  edge [
    source 2
    target 3
  ]
  edge [
    source 2
    target 4
  ]
  edge [
    source 3
    target 4
  ]
]

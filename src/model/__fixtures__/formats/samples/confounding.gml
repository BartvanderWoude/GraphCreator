graph [
  directed 1
  node [
    id 0
    label "A"
    name "A"
    graphics [
      x -172
      y -104
    ]
  ]
  node [
    id 1
    label "B"
    name "B"
    graphics [
      x 188
      y -98
    ]
  ]
  node [
    id 2
    label "D"
    name "D"
    role "outcome"
    graphics [
      x 188
      y 210.1
    ]
  ]
  node [
    id 3
    label "E"
    name "E"
    role "exposure"
    graphics [
      x -172
      y 207.7
    ]
  ]
  node [
    id 4
    label "Z"
    name "Z"
    graphics [
      x 18
      y 39.8
    ]
  ]
  edge [
    source 0
    target 3
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
    target 4
  ]
  edge [
    source 3
    target 2
  ]
  edge [
    source 4
    target 2
  ]
  edge [
    source 4
    target 3
  ]
]

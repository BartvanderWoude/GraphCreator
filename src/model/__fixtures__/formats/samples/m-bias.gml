graph [
  directed 1
  node [
    id 0
    label "D"
    name "D"
    role "outcome"
    graphics [
      x 132
      y 132
    ]
  ]
  node [
    id 1
    label "E"
    name "E"
    role "exposure"
    graphics [
      x -168
      y 132
    ]
  ]
  node [
    id 2
    label "U1"
    name "U1"
    role "latent"
    graphics [
      x -168
      y -18
    ]
  ]
  node [
    id 3
    label "U2"
    name "U2"
    role "latent"
    graphics [
      x 132
      y -18
    ]
  ]
  node [
    id 4
    label "Z"
    name "Z"
    graphics [
      x -18
      y 82
    ]
  ]
  edge [
    source 1
    target 0
  ]
  edge [
    source 2
    target 1
  ]
  edge [
    source 2
    target 4
  ]
  edge [
    source 3
    target 0
  ]
  edge [
    source 3
    target 4
  ]
]

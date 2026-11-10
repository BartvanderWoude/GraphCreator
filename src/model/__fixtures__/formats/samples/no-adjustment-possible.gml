graph [
  directed 1
  node [
    id 0
    label "U"
    name "U"
    role "latent"
    graphics [
      x 182
      y -68
    ]
  ]
  node [
    id 1
    label "E"
    name "E"
    role "exposure"
    graphics [
      x 32
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
      y 32
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
    source 1
    target 2
  ]
]

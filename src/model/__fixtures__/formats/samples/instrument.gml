graph [
  directed 1
  node [
    id 0
    label "Z"
    name "Z"
    graphics [
      x 48
      y 48
    ]
  ]
  node [
    id 1
    label "X"
    name "X"
    role "exposure"
    graphics [
      x 198
      y 48
    ]
  ]
  node [
    id 2
    label "Y"
    name "Y"
    role "outcome"
    graphics [
      x 348
      y 48
    ]
  ]
  node [
    id 3
    label "U"
    name "U"
    role "latent"
    graphics [
      x 273
      y -52
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
    source 3
    target 1
  ]
  edge [
    source 3
    target 2
  ]
]

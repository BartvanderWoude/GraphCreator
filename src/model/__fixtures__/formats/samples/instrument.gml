graph [
  directed 1
  node [
    id 0
    label "Z"
    name "Z"
    graphics [
      x 32
      y 32
    ]
  ]
  node [
    id 1
    label "X"
    name "X"
    role "exposure"
    graphics [
      x 182
      y 32
    ]
  ]
  node [
    id 2
    label "Y"
    name "Y"
    role "outcome"
    graphics [
      x 332
      y 32
    ]
  ]
  node [
    id 3
    label "U"
    name "U"
    role "latent"
    graphics [
      x 257
      y -68
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

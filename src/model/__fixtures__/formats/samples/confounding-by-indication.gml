graph [
  directed 1
  node [
    id 0
    label "Severity"
    name "Severity"
    role "latent"
    graphics [
      x 198
      y -72
    ]
  ]
  node [
    id 1
    label "Indication"
    name "Indication"
    graphics [
      x 48
      y 8
    ]
  ]
  node [
    id 2
    label "Drug"
    name "Drug"
    role "exposure"
    graphics [
      x 48
      y 148
    ]
  ]
  node [
    id 3
    label "Recovery"
    name "Recovery"
    role "outcome"
    graphics [
      x 348
      y 148
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
    target 3
  ]
  edge [
    source 2
    target 3
  ]
]

graph [
  directed 1
  node [
    id 0
    label "Severity"
    name "Severity"
    role "latent"
    graphics [
      x 190
      y -80
    ]
  ]
  node [
    id 1
    label "Indication"
    name "Indication"
    graphics [
      x 47
      y 7
    ]
  ]
  node [
    id 2
    label "Drug"
    name "Drug"
    role "exposure"
    graphics [
      x 32
      y 132
    ]
  ]
  node [
    id 3
    label "Recovery"
    name "Recovery"
    role "outcome"
    graphics [
      x 340
      y 140
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

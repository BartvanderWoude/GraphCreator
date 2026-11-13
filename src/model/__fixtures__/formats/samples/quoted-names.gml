graph [
  directed 1
  node [
    id 0
    label "Maternal_smoking"
    name "Maternal smoking"
    role "exposure"
    graphics [
      x 48
      y 48
    ]
  ]
  node [
    id 1
    label "Birth_weight"
    name "Birth weight"
    role "outcome"
    graphics [
      x 348
      y 48
    ]
  ]
  node [
    id 2
    label "Socio_economic_status"
    name "Socio-economic status"
    graphics [
      x 198
      y -72
    ]
  ]
  node [
    id 3
    label "say__hi_"
    name "say &#34;hi&#34;"
    role "latent"
    graphics [
      x 198
      y 168
    ]
  ]
  edge [
    source 0
    target 1
  ]
  edge [
    source 2
    target 0
  ]
  edge [
    source 2
    target 1
  ]
  edge [
    source 3
    target 1
  ]
]

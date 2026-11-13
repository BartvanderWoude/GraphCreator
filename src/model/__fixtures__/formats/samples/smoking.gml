graph [
  directed 1
  name "Smoking and birth weight"
  node [
    id 0
    label "Maternal_smoking"
    name "Maternal smoking"
    role "exposure"
    var_type "categorical"
    levels "never"
    levels "former"
    levels "current"
    description "Self-reported during pregnancy"
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
    var_type "continuous"
    unit "g"
    graphics [
      x 348
      y 48
    ]
  ]
  node [
    id 2
    label "SES"
    name "SES"
    var_type "ordinal"
    levels "low"
    levels "mid"
    levels "high"
    graphics [
      x 198
      y -72
    ]
  ]
  node [
    id 3
    label "Genetic_factors"
    name "Genetic factors"
    role "latent"
    graphics [
      x 198
      y 168
    ]
  ]
  edge [
    source 2
    target 0
    evidence "PMID:123"
    evidence "doi:10.1000/xyz"
    note "Well established"
  ]
  edge [
    source 0
    target 1
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

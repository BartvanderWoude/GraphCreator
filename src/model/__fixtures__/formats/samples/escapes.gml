graph [
  directed 1
  name "Gr&#246;&#223;e &#38; &#34;quotes&#34;"
  node [
    id 0
    label "Gr__e__"
    name "Gr&#246;&#223;e &#946;"
    role "exposure"
    var_type "ordinal"
    levels "a;b"
    levels "back\slash"
    levels "c"
    description "Says &#34;hi&#34; &#38; <bye>"
    graphics [
      x 33
      y 33
    ]
  ]
  node [
    id 1
    label "1st_visit"
    name "1st visit"
    role "outcome"
    var_type "continuous"
    unit "kg/m&#178;"
    graphics [
      x 233
      y 33
    ]
  ]
  node [
    id 2
    label "node_2"
    name "node"
    role "adjusted"
    graphics [
      x 132
      y 182
    ]
  ]
  node [
    id 3
    label "a.b"
    name "a.b"
    role "selected"
    graphics [
      x 332
      y 182
    ]
  ]
  edge [
    source 0
    target 1
    evidence "PMID:1;2"
    evidence "doi:10.1/x"
    note "It's &#34;known&#34;"
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
    source 1
    target 3
  ]
]

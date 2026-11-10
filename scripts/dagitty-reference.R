# Writes the causal-analysis reference answers (spec 4.13, "Reference fixtures") with dagitty-R.
#
# Development-time only: dagitty-R is used as an outside oracle; none of its code enters the app.
# CI never runs this script; its output, src/model/__fixtures__/analysis/reference.json, is
# committed.
#
# Install dagitty once. The R package curl needs the libcurl4-openssl-dev headers; without libv8 or
# libnode, V8 can fetch its own static libv8:
#   DOWNLOAD_STATIC_LIBV8=1 Rscript -e 'install.packages("dagitty", lib = Sys.getenv("R_LIBS_USER"))'
# Run from the repository root:
#   Rscript scripts/dagitty-reference.R
#
# `graphs`: for every gallery file, by node name (dagitty ids; the gallery uses no labels):
# - the roles dagitty read (selected nodes are read from the file, dagitty-R has no accessor);
# - adjustmentSets(g0, type = "minimal", effect = "total"), where g0 is g with the adjusted roles
#   cleared: dagitty-R otherwise lists only sets containing every adjusted node, while GraphCreator
#   lists them regardless of Z;
# - isAdjustmentSet(g, adjustedNodes(g));
# - impliedConditionalIndependencies(g, type = "missing.edge"), duplicates kept;
# - instrumentalVariables(g) when there is exactly one exposure and one outcome (else null);
# - paths(g, Z = c(adjusted, selected)) with their open flags. paths() returns empty path texts
#   when there are several exposures or outcomes (dagitty 0.3.4), so paths are listed per
#   exposure-outcome pair, keeping only those whose inner nodes are neither exposures nor outcomes.
#
# `random`: 100 seeded random DAGs (5-8 nodes, one exposure, one outcome, one selected node) with
# their minimal sets, for the selection criterion.

suppressMessages(library(dagitty))
suppressMessages(library(jsonlite))

dir <- file.path("src", "model", "__fixtures__", "analysis")
if (!dir.exists(dir)) stop("Run this script from the repository root.")
out <- file.path(dir, "reference.json")

# A character vector as a JSON array (also when it has 0 or 1 items).
arr <- function(x) as.list(sort(as.character(x)))

# "E <- Z -> D" → c("E", "Z", "D")
path_nodes <- function(p) strsplit(p, " (<-|->) ")[[1]]

# Ids of the vertex statements carrying the `selected` role, as in `S [selected,pos="…"]`.
selected_in <- function(lines) {
  hits <- regmatches(lines, regexec("^\\s*([0-9A-Za-z_.]+)\\s*\\[[^]]*\\bselected\\b", lines))
  unique(vapply(Filter(length, hits), function(m) m[[2]], ""))
}

# Minimal sets regardless of the adjusted roles.
minimal_sets <- function(g) {
  g0 <- g
  adjustedNodes(g0) <- character(0)
  unname(lapply(adjustmentSets(g0, type = "minimal", effect = "total"), arr))
}

graphs <- list()
for (path in sort(list.files(dir, pattern = "\\.dagitty\\.txt$", full.names = TRUE))) {
  lines <- readLines(path, warn = FALSE)
  g <- dagitty(paste(lines, collapse = "\n"))
  xs <- exposures(g)
  ys <- outcomes(g)
  zs <- adjustedNodes(g)
  ss <- selected_in(lines)

  ici <- impliedConditionalIndependencies(g, type = "missing.edge")
  independencies <- unname(lapply(ici, function(i) {
    list(a = i$X, b = i$Y, given = arr(i$Z))
  }))

  instruments <- NULL
  if (length(xs) == 1 && length(ys) == 1) {
    instruments <- unname(lapply(instrumentalVariables(g), function(i) {
      list(instrument = i$I, given = arr(i$Z))
    }))
  }

  paths_out <- list()
  for (x in sort(xs)) {
    for (y in sort(ys)) {
      p <- paths(g, from = x, to = y, Z = c(zs, ss))
      for (k in seq_along(p$paths)) {
        nodes <- path_nodes(p$paths[[k]])
        inner <- nodes[-c(1, length(nodes))]
        if (any(inner %in% c(xs, ys))) next
        paths_out[[length(paths_out) + 1]] <- list(
          path = p$paths[[k]], nodes = as.list(nodes), open = p$open[[k]]
        )
      }
    }
  }

  graphs[[basename(path)]] <- list(
    exposures = arr(xs),
    outcomes = arr(ys),
    adjusted = arr(zs),
    latent = arr(latents(g)),
    selected = arr(ss),
    adjustmentSets = minimal_sets(g),
    isAdjustmentSet = isAdjustmentSet(g, zs),
    independencies = independencies,
    instruments = instruments,
    paths = paths_out
  )
}

# Random DAGs: nodes A, B, … in a random topological order, each forward edge with probability
# 0.4; the exposure comes before the outcome in that order; the selected node is any other node.
set.seed(20261109)
random <- list()
for (k in 1:100) {
  n <- sample(5:8, 1)
  names <- LETTERS[seq_len(n)]
  ord <- sample(names)
  edges <- list()
  for (i in seq_len(n - 1)) {
    for (j in (i + 1):n) {
      if (runif(1) < 0.4) edges[[length(edges) + 1]] <- c(ord[[i]], ord[[j]])
    }
  }
  pair <- sort(sample(n, 2))
  x <- ord[[pair[[1]]]]
  y <- ord[[pair[[2]]]]
  s <- sample(setdiff(names, c(x, y)), 1)
  role <- function(v) if (v == x) "exposure" else if (v == y) "outcome" else if (v == s) "selected" else ""
  vertex_lines <- vapply(names, function(v) {
    r <- role(v)
    if (r == "") v else sprintf("%s [%s]", v, r)
  }, "")
  edge_lines <- vapply(edges, function(e) paste(e[[1]], "->", e[[2]]), "")
  text <- paste(c("dag {", vertex_lines, edge_lines, "}"), collapse = "\n")
  g <- dagitty(text)
  random[[k]] <- list(
    dagitty = text,
    exposure = x,
    outcome = y,
    selected = s,
    adjustmentSets = minimal_sets(g)
  )
}

version <- as.character(packageVersion("dagitty"))
result <- list(dagitty = version, graphs = graphs, random = random)
json <- toJSON(result, auto_unbox = TRUE, pretty = TRUE, null = "null")
writeLines(json, out)
cat("Wrote", out, "for", length(graphs), "graphs and", length(random), "random DAGs with dagitty",
    version, "\n")

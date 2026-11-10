# The R half of the exchange-format reference (spec 4.15, phase 40); run by
# scripts/check-formats.py, which merges its output into
# src/model/__fixtures__/formats/reference.json. Prints JSON on stdout.
#
# Development-time only; CI never runs it. For every sample in src/model/__fixtures__/formats/samples:
# - bnlearn: the nodes and arcs that model2network() reads from <sample>.bnlearn.txt;
# - dagitty: the exposures, outcomes, latents and edges dagitty() reads from
#   <sample>.details.dagitty.txt, whether they equal those of <sample>.plain.dagitty.txt, and
#   whether every gc.* attribute of the details file is still in as.character() of the graph.
#
# Install once (R 4.3 needs an archived bnlearn: 5.x requires R >= 4.4; building it needs the
# LAPACK, BLAS and Fortran development files):
#   sudo apt install liblapack-dev libblas-dev gfortran
#   Rscript -e 'install.packages("https://cran.r-project.org/src/contrib/Archive/bnlearn/bnlearn_4.9.4.tar.gz", repos = NULL, type = "source")'
# dagitty: see scripts/dagitty-reference.R.

suppressMessages(library(bnlearn))
suppressMessages(library(dagitty))
suppressMessages(library(jsonlite))

dir <- file.path("src", "model", "__fixtures__", "formats", "samples")
if (!dir.exists(dir)) stop("Run this script from the repository root.")

read_text <- function(path) paste(readLines(path, encoding = "UTF-8", warn = FALSE), collapse = "\n")
arr <- function(x) as.list(sort(as.character(x)))
pairs <- function(from, to) {
  if (length(from) == 0) return(list())
  lapply(seq_along(from), function(i) list(from[[i]], to[[i]]))
}

dagitty_facts <- function(g) {
  e <- edges(g)
  list(
    exposures = arr(exposures(g)),
    outcomes = arr(outcomes(g)),
    latents = arr(latents(g)),
    edges = pairs(as.character(e$v), as.character(e$w))
  )
}

names <- sub("\\.bnlearn\\.txt$", "", list.files(dir, pattern = "\\.bnlearn\\.txt$"))
samples <- list()
for (name in names) {
  net <- model2network(trimws(read_text(file.path(dir, paste0(name, ".bnlearn.txt")))))
  a <- arcs(net)

  details_text <- read_text(file.path(dir, paste0(name, ".details.dagitty.txt")))
  details <- dagitty(details_text)
  plain <- dagitty(read_text(file.path(dir, paste0(name, ".plain.dagitty.txt"))))
  facts <- dagitty_facts(details)
  plain_facts <- dagitty_facts(plain)
  sort_pairs <- function(p) sort(vapply(p, function(x) paste(x[[1]], x[[2]], sep = " -> "), ""))
  same <- identical(facts[c("exposures", "outcomes", "latents")], plain_facts[c("exposures", "outcomes", "latents")]) &&
    identical(sort_pairs(facts$edges), sort_pairs(plain_facts$edges))
  attrs <- regmatches(details_text, gregexpr('gc\\.[a-z_]+="(\\\\.|[^"\\\\])*"', details_text))[[1]]
  printed <- as.character(details)
  keeps <- all(vapply(attrs, function(x) grepl(x, printed, fixed = TRUE), TRUE))

  samples[[name]] <- list(
    bnlearn = list(nodes = arr(nodes(net)), arcs = pairs(a[, "from"], a[, "to"])),
    dagitty = c(facts, list(same_as_plain = same, keeps_details = keeps, gc_attributes = length(attrs)))
  )
}

cat(toJSON(list(
  tools = list(
    R = paste(R.version$major, R.version$minor, sep = "."),
    bnlearn = as.character(packageVersion("bnlearn")),
    dagitty = as.character(packageVersion("dagitty"))
  ),
  samples = samples
), auto_unbox = TRUE, null = "null"))

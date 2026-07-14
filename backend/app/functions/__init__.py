from . import (
    bin_set_heatmap,
    bin_size_histogram,
    bin_stats,
    bin_to_genomes,
    compare_contrasts,
    core_genome,
    genome_organization,
    phylogeny_vs_core,
    rarefaction,
    synteny_layout,
)

ALL_FUNCTIONS = [
    genome_organization.SPEC,
    compare_contrasts.SPEC,
    bin_to_genomes.SPEC,
    bin_set_heatmap.SPEC,
    synteny_layout.SPEC,
    phylogeny_vs_core.SPEC,
    core_genome.SPEC,
    # bonus
    rarefaction.SPEC,
    bin_size_histogram.SPEC,
    bin_stats.SPEC,
]

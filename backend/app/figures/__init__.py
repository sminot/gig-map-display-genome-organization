from . import (
    bin_classifier,
    bin_set_heatmap,
    bin_size_histogram,
    bin_stats,
    bin_to_genomes,
    compare_contrasts,
    core_genome,
    enriched_terms,
    genome_organization,
    phylogeny_viewer,
    phylogeny_vs_core,
    rarefaction,
    synteny_layout,
    volcano,
)

ALL_FIGURES = [
    genome_organization.SPEC,
    compare_contrasts.SPEC,
    volcano.SPEC,
    bin_to_genomes.SPEC,
    bin_set_heatmap.SPEC,
    synteny_layout.SPEC,
    phylogeny_vs_core.SPEC,
    phylogeny_viewer.SPEC,
    core_genome.SPEC,
    # bonus
    rarefaction.SPEC,
    bin_size_histogram.SPEC,
    bin_stats.SPEC,
    bin_classifier.SPEC,
    enriched_terms.SPEC,
]

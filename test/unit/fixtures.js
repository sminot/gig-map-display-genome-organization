/** A three-genome, four-gene alignment, small enough to reason about by hand. */
export function alignmentRows() {
  const rows = [];
  const genomes = ['genome_a', 'genome_b', 'genome_c'];
  const genes = [
    { sseqid: 'gene1', qstart: 100, qend: 400 },
    { sseqid: 'gene2', qstart: 500, qend: 900 },
    { sseqid: 'gene3', qstart: 1000, qend: 1600 },
    { sseqid: 'gene4', qstart: 1700, qend: 2000 },
  ];

  for (const genome of genomes) {
    for (const gene of genes) {
      // genome_c is missing gene4, so it exercises the absent-arc path.
      if (genome === 'genome_c' && gene.sseqid === 'gene4') continue;
      rows.push({
        qseqid: 'contig1',
        sseqid: gene.sseqid,
        pident: 99,
        length: gene.qend - gene.qstart,
        qstart: gene.qstart,
        qend: gene.qend,
        qlen: 2400,
        sstart: 1,
        send: gene.qend - gene.qstart,
        slen: gene.qend - gene.qstart,
        genome,
        coverage: 100,
      });
    }
  }
  return rows;
}

export function geneAnnotationRows() {
  return [
    { gene_id: 'gene1', bin: 'Bin 1', name: 'alpha' },
    { gene_id: 'gene2', bin: 'Bin 1', name: 'beta' },
    { gene_id: 'gene3', bin: 'Bin 2', name: 'gamma' },
    { gene_id: 'gene4', bin: 'Bin 3', name: 'delta' },
  ];
}

export function genomeAnnotationRows() {
  return [
    { genome_id: 'genome_a', source: 'gut', depth: 30 },
    { genome_id: 'genome_b', source: 'oral', depth: 10 },
    { genome_id: 'genome_c', source: 'gut', depth: 20 },
  ];
}

/**
 * Synthetic alignment data for the browser tests, generated in the page rather than
 * loaded from a file. That exercises the row-injection path a host application uses,
 * and keeps the tests independent of the demo dataset in data/.
 */

const GENOME_COUNT = 6;
const GENE_COUNT = 60;
const CONTIG_LENGTH = 60000;

export function alignmentRows() {
  const rows = [];
  for (let g = 0; g < GENOME_COUNT; g++) {
    const genome = `genome_${String(g).padStart(2, '0')}`;
    for (let i = 0; i < GENE_COUNT; i++) {
      // A deterministic gappy pattern, so rings differ from each other.
      if ((i + g) % 7 === 0) continue;
      const qstart = 100 + i * 900;
      rows.push({
        qseqid: 'contig1',
        sseqid: `gene_${String(i).padStart(3, '0')}`,
        pident: 90 + (i % 10),
        length: 600,
        qstart,
        qend: qstart + 600,
        qlen: CONTIG_LENGTH,
        sstart: 1,
        send: 600,
        slen: 600,
        genome,
        coverage: 80 + (i % 20),
      });
    }
  }
  return rows;
}

export function geneAnnotationRows() {
  return Array.from({ length: GENE_COUNT }, (_, i) => ({
    gene_id: `gene_${String(i).padStart(3, '0')}`,
    bin: `Bin ${(i % 3) + 1}`,
    name: `product ${i}`,
  }));
}

export function genomeAnnotationRows() {
  return Array.from({ length: GENOME_COUNT }, (_, g) => ({
    genome_id: `genome_${String(g).padStart(2, '0')}`,
    source: g % 2 === 0 ? 'gut' : 'oral',
    depth: (GENOME_COUNT - g) * 10,
  }));
}

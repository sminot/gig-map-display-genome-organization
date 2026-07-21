"""Scan DATASETS_DIR and infer dataset type from file contents."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from gig_map_io import ContrastMetagenomes, Pangenome, PangenomePhylogeny

DEFAULT_DATASETS_DIR = "./datasets"
CONTRAST_PARAMETER = "disease"
BESTTREE_SUFFIX = ".msa.raxml.bestTree"

_HASH_SUFFIX = re.compile(r"\s*\([0-9a-fA-F]{5,}\)\s*$")
_TRAILING_NUMBER = re.compile(r"(\d+)$")


def _bin_sort_key(bin_name: str) -> tuple[int, str]:
    match = _TRAILING_NUMBER.search(bin_name)
    return (int(match.group(1)) if match else 0, bin_name)


def datasets_dir() -> Path:
    return Path(os.environ.get("DATASETS_DIR", DEFAULT_DATASETS_DIR)).resolve()


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug


def parse_organism(folder_name: str) -> str:
    """Strip workflow prefix, cohort, size/param suffix, and hash to get the organism."""
    s = _HASH_SUFFIX.sub("", folder_name)
    idx = s.find(" (n=")
    if idx != -1:
        s = s[:idx]
    return s.split(" - ")[-1].strip()


def infer_type(data_dir: Path) -> str:
    if (data_dir / "bin_pangenome" / "gene_bins.csv").exists():
        return "pangenome"
    if (data_dir / "association" / "association.csv").exists():
        return "contrast"
    if (data_dir / "raxml").is_dir() and any((data_dir / "raxml").glob("*.bestTree")):
        return "phylogenies"
    return "unknown"


@dataclass(frozen=True)
class DatasetInfo:
    id: str
    name: str
    type: str
    organism: str
    path: str
    source: dict

    @property
    def data_dir(self) -> Path:
        return Path(self.path) / "data"


class DatasetRegistry:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or datasets_dir()
        self._by_id: dict[str, DatasetInfo] = {}
        self.scan()

    def scan(self) -> None:
        self._by_id = {}
        if not self.root.is_dir():
            return
        for folder in sorted(self.root.iterdir()):
            data_dir = folder / "data"
            if not data_dir.is_dir():
                continue
            source: dict = {}
            source_file = data_dir / "source.json"
            if source_file.exists():
                source = json.loads(source_file.read_text())
            name = source.get("name") or folder.name
            info = DatasetInfo(
                id=slugify(folder.name),
                name=name,
                type=infer_type(data_dir),
                organism=parse_organism(folder.name),
                path=str(folder),
                source=source,
            )
            self._by_id[info.id] = info

    def list(self, type: str | None = None) -> list[DatasetInfo]:
        items = list(self._by_id.values())
        if type is not None:
            items = [d for d in items if d.type == type]
        return items

    def get(self, dataset_id: str) -> DatasetInfo:
        if dataset_id not in self._by_id:
            raise KeyError(f"Unknown dataset id: {dataset_id}")
        return self._by_id[dataset_id]

    def require(self, dataset_id: str, type: str) -> DatasetInfo:
        info = self.get(dataset_id)
        if info.type != type:
            raise ValueError(
                f"Dataset {dataset_id} is type '{info.type}', expected '{type}'"
            )
        return info

    def pangenome(self, dataset_id: str) -> Pangenome:
        return _load_pangenome(str(self.require(dataset_id, "pangenome").data_dir))

    def contrast(self, dataset_id: str) -> ContrastMetagenomes:
        return _load_contrast(str(self.require(dataset_id, "contrast").data_dir))

    def phylogeny(self, dataset_id: str) -> PangenomePhylogeny:
        return _load_phylogeny(str(self.require(dataset_id, "phylogenies").data_dir))

    def phylogeny_bin_names(self, dataset_id: str) -> list[str]:
        data_dir = self.require(dataset_id, "phylogenies").data_dir
        return list(_phylogeny_bin_names(str(data_dir)))

    def bin_name_set(self, dataset_id: str) -> frozenset[str]:
        return _bin_name_set(str(self.require(dataset_id, "pangenome").data_dir))

    def feature_name_set(self, dataset_id: str) -> frozenset[str]:
        return _feature_name_set(str(self.require(dataset_id, "contrast").data_dir))


# gig_map_io readers cache their DataFrames per instance, so cache the instances.
@lru_cache(maxsize=None)
def _load_pangenome(data_dir: str) -> Pangenome:
    return Pangenome(data_dir)


@lru_cache(maxsize=None)
def _load_contrast(data_dir: str) -> ContrastMetagenomes:
    return ContrastMetagenomes(data_dir, CONTRAST_PARAMETER)


@lru_cache(maxsize=None)
def _load_phylogeny(data_dir: str) -> PangenomePhylogeny:
    return PangenomePhylogeny(data_dir)


@lru_cache(maxsize=None)
def _phylogeny_bin_names(data_dir: str) -> tuple[str, ...]:
    raxml = Path(data_dir) / "raxml"
    bins = [p.name[: -len(BESTTREE_SUFFIX)] for p in raxml.glob(f"*{BESTTREE_SUFFIX}")]
    return tuple(sorted(bins, key=_bin_sort_key))


@lru_cache(maxsize=None)
def _bin_name_set(data_dir: str) -> frozenset[str]:
    return frozenset(_load_pangenome(data_dir).bin_names)


@lru_cache(maxsize=None)
def _feature_name_set(data_dir: str) -> frozenset[str]:
    return frozenset(_load_contrast(data_dir).association["feature"].dropna().unique())

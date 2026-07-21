from __future__ import annotations

import numpy as np
from pydantic import BaseModel
from sklearn.base import clone
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split

from ..registry import Context, FigureSpec

MIN_CLASS_SAMPLES = 5
MAX_ROC_POINTS = 100
RANDOM_STATE = 0


class Params(BaseModel):
    contrastId: str
    labelColumn: str = "disease"
    maxDepth: int = 4
    learningRate: float = 0.05
    nEstimators: int = 300
    cvFolds: int = 5
    topFeatures: int = 20


def _downsample_roc(fpr: np.ndarray, tpr: np.ndarray) -> list[dict]:
    if len(fpr) > MAX_ROC_POINTS:
        idx = np.unique(np.linspace(0, len(fpr) - 1, MAX_ROC_POINTS).round().astype(int))
        fpr, tpr = fpr[idx], tpr[idx]
    return [{"fpr": float(a), "tpr": float(b)} for a, b in zip(fpr, tpr)]


def run(params: Params, ctx: Context) -> dict:
    import xgboost as xgb
    import shap

    contrast = ctx.datasets.contrast(params.contrastId)

    if params.labelColumn not in contrast.metadata.columns:
        raise ValueError(f"label '{params.labelColumn}' not found in metadata")

    X = np.log1p(contrast.rpkm)
    labels = contrast.metadata[params.labelColumn].dropna()
    common = X.index.intersection(labels.index)
    X = X.loc[common]
    y = labels.loc[common].astype(int)

    classes = sorted(y.unique())
    if len(classes) != 2:
        raise ValueError(f"label '{params.labelColumn}' is not binary")
    counts = y.value_counts()
    if counts.min() < MIN_CLASS_SAMPLES:
        raise ValueError(
            f"each class of '{params.labelColumn}' needs >= {MIN_CLASS_SAMPLES} samples"
        )

    negative, positive = classes

    model = xgb.XGBClassifier(
        objective="binary:logistic",
        eval_metric="logloss",
        n_estimators=params.nEstimators,
        max_depth=params.maxDepth,
        learning_rate=params.learningRate,
        subsample=0.8,
        colsample_bytree=0.8,
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=RANDOM_STATE, stratify=y
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    cv = StratifiedKFold(n_splits=params.cvFolds, shuffle=True, random_state=RANDOM_STATE)
    cv_scores = cross_val_score(clone(model), X, y, cv=cv, scoring="roc_auc")

    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, pos_label=positive, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, pos_label=positive, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, pos_label=positive, zero_division=0)),
        "rocAuc": float(roc_auc_score(y_test, y_proba)),
        "cvRocAucMean": float(cv_scores.mean()),
        "cvRocAucStd": float(cv_scores.std()),
    }

    fpr, tpr, _ = roc_curve(y_test, y_proba, pos_label=positive)
    roc = _downsample_roc(fpr, tpr)

    tn, fp, fn, tp = confusion_matrix(y_test, y_pred, labels=[negative, positive]).ravel()

    gain = model.get_booster().get_score(importance_type="gain")
    shap_values = shap.TreeExplainer(model).shap_values(X)
    mean_abs_shap = np.abs(np.asarray(shap_values)).mean(axis=0)
    shap_by_feature = dict(zip(X.columns, mean_abs_shap))

    ranked = sorted(X.columns, key=lambda f: gain.get(f, 0.0), reverse=True)
    importance = [
        {
            "feature": str(f),
            "gain": float(gain.get(f, 0.0)),
            "meanAbsShap": float(shap_by_feature[f]),
        }
        for f in ranked[: params.topFeatures]
    ]

    return {
        "label": params.labelColumn,
        "task": "binary",
        "nSamples": int(len(y)),
        "nFeatures": int(X.shape[1]),
        "nPositive": int((y == positive).sum()),
        "nNegative": int((y == negative).sum()),
        "metrics": metrics,
        "roc": roc,
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "importance": importance,
    }


SPEC = FigureSpec(
    id="bin_classifier",
    title="Bin Classifier",
    category="contrast",
    description="XGBoost classifier predicting a binary label from a contrast's bin abundances.",
    model=Params,
    handler=run,
)

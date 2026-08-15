import React from "react";
import checkIcon from "../assets/breadcrumb-icons/check.png";
import connectIcon from "../assets/breadcrumb-icons/connect.png";
import errorIcon from "../assets/breadcrumb-icons/error.png";
import loadIcon from "../assets/breadcrumb-icons/load.png";
import memoryIcon from "../assets/breadcrumb-icons/memory.png";
import micIcon from "../assets/breadcrumb-icons/mic.png";
import modeIcon from "../assets/breadcrumb-icons/mode.png";
import pauseIcon from "../assets/breadcrumb-icons/pause.png";
import planIcon from "../assets/breadcrumb-icons/plan.png";
import rateIcon from "../assets/breadcrumb-icons/rate.png";
import restoreIcon from "../assets/breadcrumb-icons/restore.png";
import reviewIcon from "../assets/breadcrumb-icons/review.png";
import saveIcon from "../assets/breadcrumb-icons/save.png";
import sceneIcon from "../assets/breadcrumb-icons/scene.png";
import shapeIcon from "../assets/breadcrumb-icons/shape.png";
import syncIcon from "../assets/breadcrumb-icons/sync.png";
import { isBreadcrumbIconName } from "../utils/breadcrumbPresentation";

const ICON_SOURCE = {
    MIC: micIcon,
    CONNECT: connectIcon,
    MEMORY: memoryIcon,
    LOAD: loadIcon,
    MODE: modeIcon,
    PLAN: planIcon,
    REVIEW: reviewIcon,
    SCENE: sceneIcon,
    RATE: rateIcon,
    SYNC: syncIcon,
    SHAPE: shapeIcon,
    CHECK: checkIcon,
    SAVE: saveIcon,
    RESTORE: restoreIcon,
    ERROR: errorIcon,
    PAUSE: pauseIcon,
};

export default function BreadcrumbIcon({ name, loading = false }) {
    if (!isBreadcrumbIconName(name)) return null;

    return (
        <img
            className={`breadcrumb-action-icon${loading ? " is-loading" : ""}`}
            data-icon={name}
            src={ICON_SOURCE[name]}
            alt=""
            aria-hidden="true"
            draggable="false"
        />
    );
}

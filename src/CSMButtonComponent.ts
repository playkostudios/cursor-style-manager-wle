import { CSMComponent } from './CSMComponent';

import type { ListenerCallback, Object3D } from '@wonderlandengine/api';
import type { CursorTarget, Cursor, EventTypes } from '@wonderlandengine/components';

export abstract class CSMButtonComponent extends CSMComponent {
    cursorTarget!: CursorTarget | undefined | null;
    hoverCallback!: ListenerCallback<[Object3D, Cursor, (EventTypes | undefined)?]>;
    unhoverCallback!: ListenerCallback<[Object3D, Cursor, (EventTypes | undefined)?]>;
    downCallback!: ListenerCallback<[Object3D, Cursor, (EventTypes | undefined)?]>;
    upCallback!: ListenerCallback<[Object3D, Cursor, (EventTypes | undefined)?]>;

    abstract onButtonClick(): void;

    override onActivate(): void {
        this.cursorTarget = this.object.getComponent('cursor-target') as (CursorTarget | null);

        if (!this.cursorTarget) {
            console.warn("Can't set up button; button object has no cursor-target component");
            return;
        }

        this.hoverCallback = this.onButtonStateChanged.bind(this, 'hovering');
        this.cursorTarget.onHover.add(this.hoverCallback);
        this.unhoverCallback = this.onButtonStateChanged.bind(this, 'released');
        this.cursorTarget.onUnhover.add(this.unhoverCallback);
        this.downCallback = this.onButtonStateChanged.bind(this, 'pressing');
        this.cursorTarget.onDown.add(this.downCallback);
        this.upCallback = () => {
            this.onButtonStateChanged('hovering');
            this.onButtonClick();
        };
        this.cursorTarget.onUp.add(this.upCallback);
    }

    override onDeactivate(): void {
        if (this.cursorTarget) {
            this.cursorTarget.onHover.remove(this.hoverCallback);
            this.cursorTarget.onUnhover.remove(this.unhoverCallback);
            this.cursorTarget.onDown.remove(this.downCallback);
            this.cursorTarget.onUp.remove(this.upCallback);
            this.cursorTarget = null;
        }
    }

    onButtonStateChanged(newState: 'hovering' | 'released' | 'pressing'): void {
        if (newState === 'hovering' || newState === 'pressing') {
            this.setCursorStyle('pointer');
        } else {
            this.setCursorStyle(null);
        }
    }
}
import { CSMButtonComponent } from 'cursor-style-manager';
import { Type, Collider } from '@wonderlandengine/api';
import { CursorTarget } from '@wonderlandengine/components';

export class TestButtonComponent extends CSMButtonComponent {
    static TypeName = 'test-button';
    static Properties = {
        ...CSMButtonComponent.Properties,
        debugText: { type: Type.String },
        mesh: { type: Type.Mesh },
        releasedMaterial: { type: Type.Material },
        hoveringMaterial: { type: Type.Material },
        pressingMaterial: { type: Type.Material },
        collisionGroup: { type: Type.Int, default: 0 },
    }

    init() {
        this.object.addComponent(CursorTarget);
        this.meshComponent = this.object.addComponent('mesh', {
            mesh: this.mesh,
            material: this.releasedMaterial,
        });

        this.collision = this.object.addComponent('collision', {
            extents: this.object.getScalingLocal(),
            collider: Collider.AxisAlignedBox,
            group: 1 << this.collisionGroup,
        });

        super.init();
    }

    onButtonClick() {
        console.debug(this.debugText)
    }

    onButtonStateChanged(newState) {
        super.onButtonStateChanged(newState);

        if (newState === 'released') {
            this.meshComponent.material = this.releasedMaterial;
        } else if (newState === 'hovering') {
            this.meshComponent.material = this.hoveringMaterial;
        } else if (newState === 'pressing') {
            this.meshComponent.material = this.pressingMaterial;
        }
    }

    static onRegister(engine) {
        engine.registerComponent(CursorTarget);
    }
}
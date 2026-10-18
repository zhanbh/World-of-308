import { ImageAsset, Node, Rect, resources, Size, Sprite, SpriteFrame, Texture2D, UITransform, Vec2 } from 'cc';

import { attackAtlas, attackFrame, attackVisibleRect } from './WarriorAttackAnimation';
import { skillAnimations, skillAtlas, skillFrame, bodyAtlas, bodyVisibleRect, gaitAtlas } from './WarriorSkillAnimation';
import type { WarriorSkillId } from './WarriorSkillAnimation';

/** Runtime pixel character with a three-beat, 24-frame normal attack. */
export class WarriorSpriteSheetView {
    private readonly node: Node;
    private readonly sprite: Sprite;
    private readonly transform: UITransform;
    private readonly atlases = new Map<string, SpriteFrame[]>();
    private readonly textures: Texture2D[] = [];
    private disposed = false;
    private currentAsset = '';
    private currentIndex = -1;

    constructor(parent: Node) {
        this.node = new Node('WarriorSlashSprite');
        this.node.layer = parent.layer;
        parent.addChild(this.node);
        this.transform = this.node.addComponent(UITransform);
        this.transform.setContentSize(58, 58);
        this.transform.setAnchorPoint(attackAtlas.anchorX, attackAtlas.anchorY);
        this.sprite = this.node.addComponent(Sprite);
        this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.node.active = false;

        this.loadAtlas(attackAtlas.resource, attackAtlas.columns, attackAtlas.rows);
        this.loadAtlas(bodyAtlas.resource, bodyAtlas.columns, bodyAtlas.rows);
        this.loadAtlas(gaitAtlas.resource, gaitAtlas.columns, gaitAtlas.rows);
        for (const id of Object.keys(skillAnimations) as WarriorSkillId[]) {
            this.loadAtlas(skillAnimations[id].resource, skillAtlas.columns, skillAtlas.rows);
        }
    }

    private loadAtlas(assetPath: string, columns: number, rows: number): void {
        resources.load(assetPath, ImageAsset, (error, image) => {
            if (this.disposed) return;
            if (error || !image) {
                console.error(`[WarriorSpriteSheetView] Unable to load resources/${assetPath}.png`, error);
                return;
            }

            const expectedCell = assetPath === attackAtlas.resource ? 320 : 416;
            if (image.width !== columns * expectedCell || image.height !== rows * expectedCell) {
                console.error(`[WarriorSpriteSheetView] Reject atlas dimensions: ${assetPath} ${image.width}x${image.height}`);
                return;
            }
            const texture = new Texture2D();
            texture.image = image;
            texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
            this.textures.push(texture);
            const frames: SpriteFrame[] = [];

            const width = image.width / columns, height = image.height / rows;
            // SpriteFrame rects use image coordinates (top-left), just like PNG.
            for (let index = 0; index < columns * rows; index++) {
                const column = index % columns;
                const row = Math.floor(index / columns);
                const frame = new SpriteFrame();
                frame.texture = texture;
                const crop = assetPath === attackAtlas.resource ? attackVisibleRect(index)
                    : assetPath === bodyAtlas.resource ? bodyVisibleRect(index) : { left: 0, top: 0, width, height };
                frame.rect = new Rect(column * width + crop.left, row * height + crop.top, crop.width, crop.height);
                frame.originalSize = new Size(crop.width, crop.height);
                frame.offset = new Vec2(0, 0);
                frames.push(frame);
            }
            this.atlases.set(assetPath, frames);
        });
    }

    /** Show one timed attack pose; return false while the asset is still loading. */
    showAttack(stage: number, elapsed: number): boolean {
        const frame = attackFrame(stage, elapsed);
        if (frame === 9 && this.showBody(8)) return true;
        return this.showFrame(attackAtlas.resource, frame);
    }

    showBody(frame: number, gaitFrame: number | null = null): boolean {
        return gaitFrame !== null && this.showFrame(gaitAtlas.resource, gaitFrame)
            || this.showFrame(bodyAtlas.resource, frame);
    }

    showSkill(id: WarriorSkillId, elapsed: number): boolean {
        if (id === 'bengshan' && elapsed >= .58 && elapsed < .68 && this.showBody(7)) return true;
        return this.showFrame(skillAnimations[id].resource, skillFrame(id, elapsed)) || this.showReady();
    }

    /** Keep one consistent pixel-art silhouette outside the attack animation. */
    showReady(): boolean {
        return this.showFrame(attackAtlas.resource, 0) || this.showFrame(skillAnimations.cross.resource, 0);
    }

    private showFrame(assetPath: string, index: number): boolean {
        const frames = this.atlases.get(assetPath);
        if (this.disposed || !frames || !frames[index]) return false;
        if (this.node.active && this.currentAsset === assetPath && this.currentIndex === index) return true;
        const isAttack = assetPath === attackAtlas.resource;
        const size = isAttack ? 58 : assetPath === bodyAtlas.resource || assetPath === gaitAtlas.resource
            ? bodyAtlas.displaySize : skillAtlas.displaySize;
        const cell = isAttack ? 320 : 416;
        const crop = isAttack ? attackVisibleRect(index) : assetPath === bodyAtlas.resource ? bodyVisibleRect(index) : { left: 0, width: cell };
        this.transform.setContentSize(size * crop.width / cell, size);
        this.transform.setAnchorPoint((cell / 2 - crop.left) / crop.width, isAttack ? attackAtlas.anchorY : skillAtlas.anchorY);
        this.sprite.spriteFrame = frames[index];
        this.currentAsset = assetPath; this.currentIndex = index;
        this.node.active = true;
        return true;
    }

    hide(): void {
        this.node.active = false;
    }

    dispose(): void {
        this.disposed = true;
        this.node.active = false;
        for (const frames of this.atlases.values()) for (const frame of frames) frame.destroy();
        this.atlases.clear();
        for (const texture of this.textures) texture.destroy();
        this.textures.length = 0;
        this.node.destroy();
    }
}

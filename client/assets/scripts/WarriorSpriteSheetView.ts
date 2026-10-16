import { ImageAsset, Node, Rect, resources, Size, Sprite, SpriteFrame, Texture2D, UITransform, Vec2 } from 'cc';

import { attackAtlas, attackFrame } from './WarriorAttackAnimation';
import { skillAnimations, skillAtlas, skillFrame } from './WarriorSkillAnimation';
import type { WarriorSkillId } from './WarriorSkillAnimation';

/** Runtime pixel character with a three-beat, 24-frame normal attack. */
export class WarriorSpriteSheetView {
    private readonly node: Node;
    private readonly sprite: Sprite;
    private readonly transform: UITransform;
    private readonly atlases = new Map<string, SpriteFrame[]>();
    private readonly textures: Texture2D[] = [];
    private disposed = false;

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
                frame.rect = new Rect(column * width, row * height, width, height);
                frame.originalSize = new Size(width, height);
                frame.offset = new Vec2(0, 0);
                frames.push(frame);
            }
            this.atlases.set(assetPath, frames);
        });
    }

    /** Show one timed attack pose; return false while the asset is still loading. */
    showAttack(stage: number, elapsed: number): boolean {
        return this.showFrame(attackAtlas.resource, attackFrame(stage, elapsed));
    }

    showSkill(id: WarriorSkillId, elapsed: number): boolean {
        return this.showFrame(skillAnimations[id].resource, skillFrame(id, elapsed)) || this.showReady();
    }

    /** Keep one consistent pixel-art silhouette outside the attack animation. */
    showReady(): boolean {
        return this.showFrame(skillAnimations.cross.resource, 0) || this.showFrame(attackAtlas.resource, 0);
    }

    private showFrame(assetPath: string, index: number): boolean {
        const frames = this.atlases.get(assetPath);
        if (this.disposed || !frames || !frames[index]) return false;
        const isAttack = assetPath === attackAtlas.resource;
        const size = isAttack ? 58 : skillAtlas.displaySize;
        this.transform.setContentSize(size, size);
        this.transform.setAnchorPoint(0.5, isAttack ? attackAtlas.anchorY : skillAtlas.anchorY);
        this.sprite.spriteFrame = frames[index];
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

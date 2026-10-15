import { ImageAsset, Node, Rect, resources, Size, Sprite, SpriteFrame, Texture2D, UITransform, Vec2 } from 'cc';

const assetPath = 'warrior-dual-slash-sprite-draft-v1';
const frameSize = 512;
const columns = 3;
const rows = 2;

/** Runtime pixel character with a six-frame normal-attack sample. */
export class WarriorSpriteSheetView {
    private readonly node: Node;
    private readonly sprite: Sprite;
    private readonly transform: UITransform;
    private readonly frames: SpriteFrame[] = [];
    private texture: Texture2D | null = null;
    private disposed = false;

    constructor(parent: Node) {
        this.node = new Node('WarriorSlashSprite');
        this.node.layer = parent.layer;
        parent.addChild(this.node);
        this.transform = this.node.addComponent(UITransform);
        this.transform.setContentSize(58, 58);
        this.transform.setAnchorPoint(0.5, 0.08);
        this.sprite = this.node.addComponent(Sprite);
        this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.node.active = false;

        resources.load(assetPath, ImageAsset, (error, image) => {
            if (this.disposed) return;
            if (error || !image) {
                console.error(`[WarriorSpriteSheetView] Unable to load resources/${assetPath}.png`, error);
                return;
            }

            const texture = new Texture2D();
            texture.image = image;
            texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
            this.texture = texture;

            // Creator's texture rect origin is at the lower-left; the source
            // PNG is authored from its upper-left, so the row index is inverted.
            for (let index = 0; index < columns * rows; index++) {
                const column = index % columns;
                const row = Math.floor(index / columns);
                const frame = new SpriteFrame();
                frame.texture = texture;
                frame.rect = new Rect(column * frameSize, (rows - 1 - row) * frameSize, frameSize, frameSize);
                frame.originalSize = new Size(frameSize, frameSize);
                frame.offset = new Vec2(0, 0);
                this.frames.push(frame);
            }
        });
    }

    /** Show one timed attack pose; return false while the asset is still loading. */
    showAttack(progress: number): boolean {
        if (this.disposed || this.frames.length !== columns * rows) return false;
        const p = Math.max(0, Math.min(1, progress));
        const frameIndex = p < 0.06 ? 0
            : p < 0.16 ? 1
                : p < 0.32 ? 2
                    : p < 0.43 ? 3
                        : p < 0.62 ? 4 : 5;
        return this.showFrame(frameIndex);
    }

    /** Keep one consistent pixel-art silhouette outside the attack animation. */
    showReady(): boolean {
        return this.showFrame(0);
    }

    private showFrame(index: number): boolean {
        if (this.disposed || this.frames.length !== columns * rows) return false;
        this.sprite.spriteFrame = this.frames[index];
        this.node.active = true;
        return true;
    }

    hide(): void {
        this.node.active = false;
    }

    dispose(): void {
        this.disposed = true;
        this.node.active = false;
        for (const frame of this.frames) frame.destroy();
        this.frames.length = 0;
        this.texture?.destroy();
        this.texture = null;
        this.node.destroy();
    }
}

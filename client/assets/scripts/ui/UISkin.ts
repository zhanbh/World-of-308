import { Graphics, ImageAsset, Node, resources, Sprite, SpriteFrame, Texture2D, UITransform } from 'cc';

/** Shared immutable skin assets; instance/operation state stays with each panel. */
const frames = new Map<string, Promise<SpriteFrame>>();
const bindings = new WeakMap<Node, string>();
export function skinSprite(node: Node, path: string, sliced = false): Sprite {
    // A node has one active UIRenderer. Keep legacy Graphics and the skin Sprite on different nodes.
    let surface = node;
    if (node.getComponent(Graphics)) {
        surface = node.getChildByName('UISkinSurface')!;
        if (!surface) {
            surface = new Node('UISkinSurface'); surface.layer = node.layer; node.addChild(surface);
            surface.addComponent(UITransform); surface.setSiblingIndex(0);
        }
        const parent = node.getComponent(UITransform)!, transform = surface.getComponent(UITransform)!;
        transform.setContentSize(parent.contentSize); transform.setAnchorPoint(parent.anchorPoint);
    }
    const sprite = surface.getComponent(Sprite) ?? surface.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
    if (bindings.get(node) === path) return sprite;
    bindings.set(node, path); sprite.spriteFrame = null;
    let loading = frames.get(path);
    if (!loading) {
        loading = new Promise<SpriteFrame>((resolve, reject) => {
            resources.load(path, ImageAsset, (error, image) => {
                if (error || !image) { frames.delete(path); reject(error ?? new Error('IMAGE_UNAVAILABLE')); return; }
                const texture = new Texture2D(); texture.image = image;
                texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
                const frame = new SpriteFrame(); frame.texture = texture;
                if (path.startsWith('ui/slices/')) {
                    const inset = path.endsWith('panel_window_frame') ? 5 : Math.min(4, Math.floor(image.width / 3));
                    frame.insetLeft = frame.insetRight = frame.insetTop = frame.insetBottom = inset;
                }
                resolve(frame);
            });
        });
        frames.set(path, loading);
    }
    void loading.then(frame => {
        if (!node.isValid || bindings.get(node) !== path) return;
        sprite.spriteFrame = frame;
        node.getComponent(Graphics)?.clear();
    }, error => { if (node.isValid && bindings.get(node) === path) console.error('[UI skin] ' + path, error); });
    return sprite;
}

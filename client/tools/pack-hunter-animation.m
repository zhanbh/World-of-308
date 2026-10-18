// Deterministic cell packing/GIF encoding, with fixed scale per source group; never redraws anatomy.
// clang -fobjc-arc -fno-modules -framework Foundation -framework CoreGraphics -framework ImageIO pack-hunter-animation.m -o /tmp/hunter-pack
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ImageIO/ImageIO.h>
static void check(BOOL pass, NSString *message) { if (!pass) { fprintf(stderr, "%s\n", message.UTF8String); exit(1); } }
static CGContextRef context(size_t w,size_t h) {
    CGColorSpaceRef space=CGColorSpaceCreateDeviceRGB();
    CGContextRef c=CGBitmapContextCreate(NULL,w,h,8,w*4,space,kCGImageAlphaPremultipliedLast);
    CGColorSpaceRelease(space); check(c!=NULL,@"Cannot create bitmap context");
    CGContextSetInterpolationQuality(c,kCGInterpolationNone); return c;
}
static void gif(NSString *path,NSArray *images,NSArray *frames,double speed) {
    CGImageDestinationRef out=CGImageDestinationCreateWithURL((__bridge CFURLRef)[NSURL fileURLWithPath:path],CFSTR("com.compuserve.gif"),images.count,NULL);
    check(out!=NULL,@"Cannot create GIF destination");
    CGImageDestinationSetProperties(out,(__bridge CFDictionaryRef)@{(__bridge NSString*)kCGImagePropertyGIFDictionary:@{(__bridge NSString*)kCGImagePropertyGIFLoopCount:@0}});
    for(NSUInteger i=0;i<images.count;i++) {
        double delay=[frames[i][@"durationMs"] doubleValue]/1000/speed;
        NSDictionary *properties=@{(__bridge NSString*)kCGImagePropertyGIFDictionary:@{
            (__bridge NSString*)kCGImagePropertyGIFDelayTime:@(delay),(__bridge NSString*)kCGImagePropertyGIFUnclampedDelayTime:@(delay)}};
        CGImageDestinationAddImage(out,(__bridge CGImageRef)images[i],(__bridge CFDictionaryRef)properties);
    }
    check(CGImageDestinationFinalize(out),@"Cannot finalize GIF"); CFRelease(out);
}
int main(int argc,const char *argv[]) { @autoreleasepool {
    check(argc==2,@"Pass animation manifest JSON path");
    NSString *manifestPath=[[NSString stringWithUTF8String:argv[1]] stringByStandardizingPath];
    NSString *root=manifestPath.stringByDeletingLastPathComponent;
    NSError *error=nil;
    NSData *data=[NSData dataWithContentsOfFile:manifestPath]; check(data!=nil,@"Cannot read manifest");
    NSDictionary *m=[NSJSONSerialization JSONObjectWithData:data options:0 error:&error]; check(m!=nil,error.description);
    int size=[m[@"cellSize"] intValue]; double anchorX=[m[@"anchorX"] doubleValue],anchorY=[m[@"anchorY"] doubleValue];
    for(NSDictionary *clip in m[@"clips"]) {
        NSString *sourcePath=[root stringByAppendingPathComponent:clip[@"source"]];
        CGImageSourceRef source=CGImageSourceCreateWithURL((__bridge CFURLRef)[NSURL fileURLWithPath:sourcePath],NULL); check(source!=NULL,@"Cannot read source");
        CGImageRef image=CGImageSourceCreateImageAtIndex(source,0,NULL); check(image!=NULL,@"Cannot decode source");
        int columns=[clip[@"columns"] intValue],rows=[clip[@"rows"] intValue]; double scale=[clip[@"scale"] doubleValue];
        NSArray *frames=clip[@"frames"],*baselines=clip[@"baselineByRow"];
        check(columns>0&&rows>0&&frames.count>0&&frames.count<=8&&baselines.count==rows&&scale>0&&size>0,@"Invalid manifest geometry");

        CGContextRef atlas=context(size*4,size*2); NSMutableArray *images=[NSMutableArray array]; int totalMs=0;
        for(NSUInteger i=0;i<frames.count;i++) {
            NSDictionary *frame=frames[i];int index=[frame[@"sourceIndex"] intValue],duration=[frame[@"durationMs"] intValue];
            check(index>=0&&index<columns*rows&&duration>0,@"Invalid frame"); int col=index%columns,row=index/columns;
            NSString *sourceFile=frame[@"source"] ?: clip[@"source"];
            NSNumber *sourceScale=clip[@"sourceScales"][sourceFile];
            double frameScale=sourceScale ? sourceScale.doubleValue : scale;
            check(frameScale>0,@"Invalid source scale");
            CGImageRef frameImage=image;
            if(frame[@"source"]) {
                NSString *framePath=[root stringByAppendingPathComponent:frame[@"source"]];
                CGImageSourceRef frameSource=CGImageSourceCreateWithURL((__bridge CFURLRef)[NSURL fileURLWithPath:framePath],NULL);
                check(frameSource!=NULL,@"Cannot read frame source");
                frameImage=CGImageSourceCreateImageAtIndex(frameSource,0,NULL);CFRelease(frameSource);
                check(frameImage!=NULL,@"Cannot decode frame source");
            }
            double cw=(double)CGImageGetWidth(frameImage)/columns,ch=(double)CGImageGetHeight(frameImage)/rows;
            double trimLeft=[frame[@"trimLeft"] doubleValue];
            double x0=round(col*cw)+trimLeft,x1=round((col+1)*cw),y0=round(row*ch),y1=round((row+1)*ch);
            CGImageRef crop=CGImageCreateWithImageInRect(frameImage,CGRectMake(x0,y0,x1-x0,y1-y0)); check(crop!=NULL,@"Cannot crop cell");
            double x=anchorX-cw/2*frameScale+trimLeft*frameScale+[frame[@"offsetX"] doubleValue];
            double baseline=frame[@"sourceBaseline"] ? [frame[@"sourceBaseline"] doubleValue] : [baselines[row] doubleValue];
            double y=anchorY-baseline*frameScale+[frame[@"offsetY"] doubleValue];
            double w=CGImageGetWidth(crop)*frameScale,h=CGImageGetHeight(crop)*frameScale;
            check(x>=0&&y>=0&&x+w<=size&&y+h<=size,@"Cell would clip; correct packing manifest");
            CGContextRef cell=context(size,size);CGContextDrawImage(cell,CGRectMake(x,size-y-h,w,h),crop);
            CGImageRef rendered=CGBitmapContextCreateImage(cell);check(rendered!=NULL,@"Cannot render cell");
            [images addObject:(__bridge id)rendered];
            CGContextDrawImage(atlas,CGRectMake((i%4)*size,(1-i/4)*size,size,size),rendered);
            CGImageRelease(rendered);CGContextRelease(cell);CGImageRelease(crop);if(frameImage!=image)CGImageRelease(frameImage);totalMs+=duration;
        }
        CGImageRef atlasImage=CGBitmapContextCreateImage(atlas);
        CGImageDestinationRef png=CGImageDestinationCreateWithURL((__bridge CFURLRef)[NSURL fileURLWithPath:[root stringByAppendingPathComponent:clip[@"output"]]],CFSTR("public.png"),1,NULL);
        check(png!=NULL,@"Cannot create atlas destination");CGImageDestinationAddImage(png,atlasImage,NULL);check(CGImageDestinationFinalize(png),@"Cannot write atlas");
        CFRelease(png);CGImageRelease(atlasImage);CGContextRelease(atlas);
        gif([root stringByAppendingPathComponent:clip[@"gif"]],images,frames,1);
        gif([root stringByAppendingPathComponent:clip[@"slowGif"]],images,frames,.25);
        printf("%s: %lu frames, %dms, anchor %.0f,%.0f\n",[clip[@"name"] UTF8String],(unsigned long)frames.count,totalMs,anchorX,anchorY);
        CGImageRelease(image);CFRelease(source);
    }
} return 0; }

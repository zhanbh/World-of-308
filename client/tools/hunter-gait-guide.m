// Anatomical line-guide only. It never loads or edits character raster artwork.
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ImageIO/ImageIO.h>
static void chain(CGContextRef c,NSArray *points,CGFloat r,CGFloat g,CGFloat b,CGFloat width) {
 CGContextSetRGBStrokeColor(c,r,g,b,1);CGContextSetRGBFillColor(c,r,g,b,1);CGContextSetLineWidth(c,width);CGContextSetLineCap(c,kCGLineCapRound);CGContextSetLineJoin(c,kCGLineJoinRound);
 CGContextBeginPath(c);for(NSUInteger i=0;i<points.count;i++){NSArray *p=points[i];CGFloat x=[p[0] doubleValue],y=[p[1] doubleValue];if(i==0)CGContextMoveToPoint(c,x,y);else CGContextAddLineToPoint(c,x,y);}CGContextStrokePath(c);
 for(NSArray *p in points)CGContextFillEllipseInRect(c,CGRectMake([p[0] doubleValue]-8,[p[1] doubleValue]-8,16,16));
}
int main(int argc,const char *argv[]){@autoreleasepool{
 if(argc!=2)return 1;NSString *path=[NSString stringWithUTF8String:argv[1]];NSData *data=[NSData dataWithContentsOfFile:path];NSDictionary *m=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil];if(!m)return 2;
 NSInteger cell=[m[@"cellSize"] integerValue],size=cell*2;NSString *root=path.stringByDeletingLastPathComponent;
 for(NSString *half in @[@"near",@"far"]){CGColorSpaceRef space=CGColorSpaceCreateDeviceRGB();CGContextRef c=CGBitmapContextCreate(NULL,size,size,8,size*4,space,kCGImageAlphaPremultipliedLast);CGColorSpaceRelease(space);CGContextTranslateCTM(c,0,size);CGContextScaleCTM(c,1,-1);CGContextSetRGBFillColor(c,.10,.13,.15,1);CGContextFillRect(c,CGRectMake(0,0,size,size));
  NSArray *frames=m[half];for(NSUInteger i=0;i<frames.count;i++){CGContextSaveGState(c);CGContextTranslateCTM(c,(i%2)*cell,(i/2)*cell);CGContextSetRGBStrokeColor(c,.4,.45,.45,1);CGContextSetLineWidth(c,2);CGContextMoveToPoint(c,70,590);CGContextAddLineToPoint(c,570,590);CGContextStrokePath(c);chain(c,frames[i][@"far"],1,.53,.20,10);chain(c,frames[i][@"near"],.2,.75,1,14);CGContextRestoreGState(c);}
  CGImageRef im=CGBitmapContextCreateImage(c);NSString *out=[root stringByAppendingPathComponent:[NSString stringWithFormat:@"run-%@-guide.png",half]];CGImageDestinationRef dest=CGImageDestinationCreateWithURL((__bridge CFURLRef)[NSURL fileURLWithPath:out],CFSTR("public.png"),1,NULL);CGImageDestinationAddImage(dest,im,NULL);if(!CGImageDestinationFinalize(dest))return 3;CFRelease(dest);CGImageRelease(im);CGContextRelease(c);
 }
}return 0;}

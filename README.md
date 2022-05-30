# texture_handler

本工具适用于 Cocos Creator 2.x

为什么会有黑边
用一个词概括，就是插值。
Cocos Creator 引擎默认对纹理进行双线性插值采样(Filter Mode = Bilinear)，在渲染图片边缘附近时，有极大概率需要边缘像素和邻近的透明像素插值计算得到要显示的颜色。
如果美术同学给的图中透明像素是RGBA=(0,0,0,0)的透明黑色，插值后的颜色就会偏黑。

目前已知去除黑边的方式有：

- 勾选纹理的预乘选项，并修改 Sprite 组件的 ``Blend Factor``，选择 ONE

- 修改纹理的 ``Filter Mode`` 为 Point

以上两种方式规避黑边问题还是会出现问题，所以有了扩边的思路。

### 什么是扩边

黑边现象是边缘像素与黑色进行插值导致，如果边缘像素和自己相近颜色插值，黑边就会自然消失。
基于这个思路将最靠近图片边缘的透明像素的alpha改为3，并且将其RGB值设为邻近非透明像素RGB的插值，简称扩边。

### 扩边方法缺点

- 轻微增加纹理空间占用。原因是图片边缘增加1px的不透明层，合图后占用的高度、宽度各增加2px
- 轻微增加图片尺寸。原因是图片颜色数量增加

## 已支持的功能

- 图片扩边，对图片透明区域进行

- TinyPng 压缩图片，需要在配置文件中填入自己的 token

## 如何调用
在 ``user_handle_config.json`` 里面自由配置相关参数

- compressByTinify 是否使用 [tiny_png](https://tinypng.com/) 去压缩图片
- tinify_token 需要将 ``compressByTinify`` 配置为 ``true`` 后，且此字段为合法才会压缩图片，[点击获取 tinypng 的 token](https://tinify.cn/developers)。
- isOverlay 配置为 ``true`` 则会原地覆盖原图，并将原图被分到当前目录下的 ``Backups`` 文件夹中，反之原图位置不变，将操作的图片输出到当前目录下的 ``Outputs`` 文件夹中。
- output_file_tree 配置为 ``true`` 每次操作图片时会打印文件的树状目录

## 工具由 nodejs + pkg，支持平台:

- [Win]()
- [MacOS]()
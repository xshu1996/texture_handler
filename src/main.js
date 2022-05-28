const path = require("path");
const fs = require("fs");
const stream = require("stream");
// npm install pngjs -g
const pngjs = require("pngjs");

let fileMap = Object.create(null);
let ImageCount = 0;
let handleImageCount = 0;
let handleSuccessImageCount = 0;


function getInput(tips = "")
{
    return new Promise((res, rej) =>
    {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });
        readline.question(tips, filePath =>
        {
            readline.close();
            return res(filePath);
        });
    });
}

function printFileTree(fileRoot, deep = 1)
{
    if (fs.statSync(fileRoot).isFile())
    {
        console.log("└─", path.basename(fileRoot));
        return;
    }
    let prev = new Array(deep).join('| ');
    let dirInfo = fs.readdirSync(fileRoot);
    let files = [];
    let dirs = [];
    for (let i = 0; i < dirInfo.length; i++)
    {
        let state = fs.statSync(path.join(fileRoot, dirInfo[i]));
        if (state.isFile())
        {
            // if (dirInfo[i].includes("dilate"))
            // {
            //     fs.rmSync(path.join(fileRoot, dirInfo[i]));
            // }
            files.push(dirInfo[i]);
        } else
        {
            dirs.push(dirInfo[i]);
        }
    }
    for (let i = 0; i < dirs.length; i++)
    {
        console.log(`${prev}├─ ${dirs[i]}`);
        let nestPath = path.join(fileRoot, dirs[i]);
        printFileTree(nestPath, deep + 1);
    }
    for (let i = 0; i < files.length; i++)
    {
        if (i === files.length - 1)
        {
            console.log(`${prev}└─ ${files[i]}`);
        } else
        {
            console.log(`${prev}├─ ${files[i]}`);
        }
    }
}

function visitFiles(filePath, handler)
{
    return new Promise(async (res, rej) =>
    {
        try
        {
            const fileStat = fs.statSync(filePath);
            if (fileStat.isDirectory())
            {
                let files = fs.readdirSync(filePath);
                for (let i = 0; i < files.length; ++i)
                {
                    await visitFiles(path.join(filePath + "/", files[i]), handler);
                }
                return res(1);
            }
            else if (fileStat.isFile())
            {
                const extName = path.extname(filePath);
                // console.log("extension name: ", extName);
                if (isValidImgFormat(extName))
                {
                    await handler(filePath, fileStat);
                    return res(1);
                }
                else
                {
                    return rej(`${ filePath } is an invalid image`);
                }
            }
        }
        catch (err)
        {
            console.error("check file stat failed: ", err);
            return rej(err);
        }
    });
}

function _formatSize(size) 
{
    return `${size > 1024 ? (size / 1024).toFixed(2) + "KB" : size + "B"}`;
}

function isValidImgFormat(extName) 
{
    return extName == ".png" || extName == ".jpg" || extName == ".jpeg";
}

function handleImage(filePath, stat)
{
    return new Promise(async (res, rej) =>
    {
        fileMap[filePath] = {
            originalSize: stat.size,
        };
        let errMsg = "";
        let data = fs.readFileSync(filePath);
        if (path.extname(filePath) === ".png")
        {
            ++handleImageCount;
            const d = await getBufferAfterDilate(data);
            if (d)
            {
                ++handleSuccessImageCount;
                data = d;
            }
            else
            {
                errMsg = "dilate png failed, file path is " + filePath;
            }
        }
        let fileName = path.basename(filePath, ".png");
        let prefix = path.dirname(filePath);
        let newPath = path.join(prefix, fileName + "_dilate.png");
        fs.writeFileSync(newPath, data);
        const afterStat = fs.statSync(newPath);
        fileMap[filePath].afterHandleSize = afterStat.size;
        let sizeDelta = fileMap[filePath].afterHandleSize - fileMap[filePath].originalSize;

        console.log(`${filePath} after dilate, original size: ${fileMap[filePath].originalSize}, after handle size: ${fileMap[filePath].afterHandleSize}, size change: ${_formatSize(sizeDelta)}`);

        return res(errMsg);
    });
}

async function getBufferAfterDilate(data)
{
    let png = await getPng(data);
    if (!png)
    {
        console.log("get png is null");
        return null;
    }
    let ret = await dilate(png.data, png.width, png.height);
    if (ret)
    {
        png.data = ret;
    }
    let buffer = await generalPng(png);

    return buffer;
}

function dilate(data, w, h)
{
    return new Promise((res, rej) =>
    {
        const buffer = Buffer.from(data);
        for (let row = 0; row < h; ++row)
        {
            for (let col = 0; col < w; ++col)
            {
                let r = 0, g = 0, b = 0, cnt = 0;
                const oriIdx = (row * w + col) * 4;
                const alpha = buffer[oriIdx + 3];

                // skip the alpha more than 2
                if (alpha > 2) continue;

                for (let x = -1; x < 2; ++x)
                {
                    let i_x = row + x;
                    // skip out of range coord
                    if (i_x < 0 || i_x >= h) continue;

                    for (let y = -1; y < 2; ++y)
                    {
                        // skip the center
                        if (x == 0 && y == 0) continue;
                        const i_y = col + y;

                        const start = (i_x * w + i_y) * 4;
                        // ignore colors whose alpha less than 30
                        if (buffer[start + 3] < 30) continue;

                        r += buffer[start];
                        g += buffer[start + 1];
                        b += buffer[start + 2];
                        ++cnt;
                    }
                }

                if (cnt > 0)
                {
                    buffer[oriIdx] = r / cnt;
                    buffer[oriIdx + 1] = g / cnt;
                    buffer[oriIdx + 2] = b / cnt;
                    buffer[oriIdx + 3] = 3;
                }
            }
        }
        return res(buffer);
    });
}

function getPng(data)
{
    return new Promise((res, rej) =>
    {
        const readable = new stream.Readable();
        readable._read = () => { };
        readable.push(data);
        const png = new pngjs.PNG({
            filterType: 4
        });
        readable
            .pipe(png)
            .on("parsed", function (data)
            {
                res(this);
            })
            .on("error", function (err)
            {
                console.log("parsed png error", err);
                rej(null);
            });
    });
}

function generalPng(data)
{
    return new Promise((res, rej) =>
    {
        const buffArr = [];
        let sumLen = 0;
        let png = data.pack();
        png.on("data", (data) =>
        {
            buffArr.push(data);
            sumLen += data.byteLength;
        });
        png.on("error", (err) =>
        {
            console.error("png package error", err);
            return rej(err);
        });
        png.on("end", () =>
        {
            const buffer = Buffer.concat(buffArr, sumLen);
            return res(buffer);
        });
    });
}

function reset()
{
    lfileMap = Object.create(null);
    ImageCount = 0;
    handleImageCount = 0;
    handleSuccessImageCount = 0;
}

async function main()
{
    let filePath = await getInput("请输入文件路径或文件夹根目录（支持拖入）:");
    if (!filePath)
    {
        console.log("输入的路径不能为空");
        return main();
    }
    console.log(`==== 输入的路径为: ${filePath} =====`);
    // console.log("/**************** File Tree Begin *********************/");
    // printFileTree(filePath);
    // console.log("/**************** File Tree End ***********************/");
    await visitFiles(filePath, handleImage);
    console.log(`/************************ completed: ${handleSuccessImageCount} *******************************/`);
    console.log("\n\n\n");
    main();
}

main();
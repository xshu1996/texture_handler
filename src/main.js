const path = require("path");
const fs = require("fs");
const stream = require("stream");
// npm install pngjs -save
const pngjs = require("pngjs");
// npm install tinify --save
const tinify = require("tinify");
const process = require("process");

let fileMap = Object.create(null);
let failedMap = Object.create(null);
let imageSumCount = 0;
let handleImageCount = 0;
let handleSuccessImageCount = 0;
let compressSumCount = 0;
let compressSuccessCount = 0;

const user_config = getHandleConfig();

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

function getHandleConfig()
{
    let config = null;
    try
    {
        // console.log("process.argv0 : ", process.argv0);
        // nodejs or app-x64
        let url = process.argv0.indexOf("node") !== -1 ?
            path.resolve(__dirname, "../build/user_handle_config.json") :
            path.resolve(process.argv0, "../user_handle_config.json");
        const data = fs.readFileSync(url, "utf-8");
        config = JSON.parse(data);
        console.log("********** User Config *********");
        console.table(config);
    }
    catch (err)
    {
        console.error("##### load user config error: ", err);
        return null;
    }

    if (config && 
        config.compressByTinify && 
        (!config.tinify_token || config.tinify_token.length <= 0)) 
    {
        console.log("Tinify token is null");
        return null;
    }

    return config;
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
                let fileName = path.basename(filePath);
                // skip the folder named backup
                if (fileName == "Backups" || fileName == "Outputs")
                {
                    return res(1);
                }
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
                    return res(`${filePath} is an invalid image`);
                }
            }
        }
        catch (err)
        {
            console.error("check file stat failed: ", err);
            return res(err);
        }
    });
}

function _formatSize(size) 
{
    let sign = Math.sign(size);
    size = Math.abs(size);
    return `${size > 1024 ? sign * (size / 1024).toFixed(2) + "KB" : sign * size + "B"}`;
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
        let fileName = path.basename(filePath, ".png");
        let prefix = path.dirname(filePath);

        let errMsg = "";
        let data = fs.readFileSync(filePath);
        let newData = null;
        if (path.extname(filePath) === ".png")
        {
            ++handleImageCount;
            newData = await getBufferAfterDilate(data);
            if (newData)
            {
                ++handleSuccessImageCount;
                let beforeSize = Buffer.byteLength(data, "binary");
                let afterSize = Buffer.byteLength(newData, "binary");
                fileMap[filePath].afterHandleSize = afterSize;
                console.log(`$$$$ Dilate: <${filePath}> beforeSize -> ${_formatSize(beforeSize)}, afterSize -> ${_formatSize(afterSize)}, ratio -> ${((beforeSize - afterSize) / beforeSize * 100).toFixed(2)}%`);
            }
            else
            {
                errMsg = "dilate png failed, file path is " + filePath;
                failedMap[filePath] = errMsg;
                return res(errMsg);
            }
        }

        if (user_config && user_config.compressByTinify)
        {
            ++compressSumCount;
            newData = await compressImage(newData);
            if (!newData)
            {
                errMsg = "compress image error";
                failedMap[filePath] = errMsg;
                return res(errMsg);
            }
            let beforeSize = Buffer.byteLength(data, "binary");
            let afterSize = Buffer.byteLength(newData, "binary");
            fileMap[filePath].afterHandleSize = afterSize;
            ++compressSuccessCount;
            console.log(`%%%% Compress: <${filePath}> beforeSize -> ${_formatSize(beforeSize)}, afterSize -> ${_formatSize(afterSize)}, ratio -> ${((beforeSize - afterSize) / beforeSize * 100).toFixed(2)}%`);
        }

        if (user_config && user_config.isOverlay)
        {
            let dirPath = path.join(prefix, "Backups");
            let hasDir = await isFileExisted(dirPath);
            if (!hasDir || !fs.statSync(dirPath).isDirectory())
            {
                fs.mkdirSync(dirPath);
            }
            fs.renameSync(filePath, path.join(dirPath, fileName + ".png"));
            fs.writeFileSync(filePath, newData);
        }
        else 
        {
            let dirPath = path.join(prefix, "Outputs");
            let hasDir = await isFileExisted(dirPath);
            if (!hasDir || !fs.statSync(dirPath).isDirectory())
            {
                fs.mkdirSync(dirPath);
            }
            filePath = path.join(dirPath, fileName + ".png");
            fs.writeFileSync(filePath, newData);
        }

        return res(1);
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
                res(null);
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
            return res(err);
        });
        png.on("end", () =>
        {
            const buffer = Buffer.concat(buffArr, sumLen);
            return res(buffer);
        });
    });
}

function compressImage(buffer)
{
    return new Promise((resolve, reject) => 
    {
        if (!user_config || !user_config.compressByTinify)
        {
            return resolve(buffer);
        }
        tinify.key = user_config === null || user_config === 0 ? 0 : user_config.tinify_token;
        tinify
            .fromBuffer(buffer)
            .toBuffer()
            .then((data) => 
            {
                resolve(Buffer.from(data));
            })
            .catch((e) => 
            {
                let errMsg = '';
                if (e instanceof tinify.AccountError)
                {
                    errMsg = "There is a problem with your API key or API account.  Your request could not be authenticated.  After verifying the API key and account status, you can retry the request.";
                }
                else if (e instanceof tinify.ClientError)
                {
                    errMsg = "The request could not be completed because of a problem with the submitted data.  The exception message will contain more information.  You should not retry the request.";
                }
                else if (e instanceof tinify.ServerError)
                {
                    errMsg = "The request could not be completed due to a temporary issue with the Tinify API.  It is safe to retry the request a few minutes later.  ";
                }
                else if (e instanceof tinify.ConnectionError)
                {
                    errMsg = "The request could not be sent to the Tinify API due to connection problems.  You should check the network connection.  It is safe to retry the request.";
                }
                console.log(`Compress image error, see the error info: ${errMsg}`);
                reject(null);
            });
    });
}

function reset()
{
    fileMap = Object.create(null);
    failedMap = Object.create(null);
    handleImageCount = 0;
    handleSuccessImageCount = 0;
    compressSumCount = 0;
    compressSuccessCount = 0;
}

function main()
{
    return new Promise(async (res, rej) =>
    {
        console.time("本次操作耗时：");
        reset();
        let filePath = await getInput("请输入文件路径或文件夹根目录（支持拖入）:");
        if (!filePath)
        {
            console.log("输入的路径不能为空");
            return main();
        }
        console.log(`==== 输入的路径为: <${filePath}>`);
    
        if (user_config && user_config.output_file_tree)
        {
            console.log("/**************** File Tree Begin *********************/");
            printFileTree(filePath);
            console.log("/**************** File Tree End ***********************/");
        }
    
        await visitFiles(filePath, handleImage);
        console.log(`/************************ completed: ${handleSuccessImageCount} *******************************/`);
    
        if (Object.keys(failedMap).length > 0)
        {
            console.log("********************** Failed Map Start ********************");
            console.table(failedMap);
            console.log("********************** Failed Map End ********************");
        }
    
        console.log("\n\n\n");
    
        console.table({
            compressSumCount,
            compressSuccessCount,
            handleImageCount,
            handleSuccessImageCount,
        });
    
        console.timeEnd("本次操作耗时：");
    
        main();
        return res(1);
    });
}

main();


/**************** tool function ************/

/**
 * 判断文件是否存在
 * @param {string} path_way 
 */
function isFileExisted(path_way)
{
    return new Promise((resolve, reject) =>
    {
        fs.access(path_way, (err) =>
        {
            if (err)
            {
                resolve(false);
            }
            else
            {
                resolve(true);
            }
        });
    });
};
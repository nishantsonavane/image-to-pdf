const fileInput = document.getElementById("fileInput");
const addMoreButton = document.getElementById("addMoreFiles"); // new button to add more files
const pageOrientation = document.getElementById("pageOrientation");
const pageSize = document.getElementById("pageSize");
const customWidth = document.getElementById("customWidth");
const customHeight = document.getElementById("customHeight");
const downloadLink = document.getElementById("downloadLink");
const mergeButton = document.getElementById("mergeButton");

let downloadClicked = false;
let allFiles = []; // will hold all selected files, not just last batch

const fileName = document.getElementById('fileName');
const dropZone = document.getElementById('dropZone');
const progressBar = document.getElementById('progressBar');

// Initially hide add more button
addMoreButton.style.display = "none";
progressBar.style.display = "none";

fileInput.addEventListener('change', () =>
{
    allFiles = [...allFiles, ...Array.from(fileInput.files)];
    updateFileNames();
    simulateProgress();
});

addMoreButton.addEventListener("click", () =>
{
    fileInput.click();
});

dropZone.addEventListener('dragover', (e) =>
{
    e.preventDefault();
    dropZone.classList.add('dragging');
});

dropZone.addEventListener('dragleave', () =>
{
    dropZone.classList.remove('dragging');
});

dropZone.addEventListener('drop', (e) =>
{
    e.preventDefault();
    dropZone.classList.remove('dragging');
    allFiles = [...allFiles, ...Array.from(e.dataTransfer.files)];
    updateFileNames();
    simulateProgress();
});

function updateFileNames()
{
    if (allFiles.length > 0)
    {
        const names = allFiles.map(f => f.name).join(', ');
        fileName.textContent = names;
        addMoreButton.style.display = "inline-block";
    } else
    {
        fileName.textContent = "No files selected";
        addMoreButton.style.display = "none";
    }
}

function simulateProgress()
{
    mergeButton.disabled = true;
    addMoreButton.disabled = true;
    progressBar.style.width = "0%";
    progressBar.style.display = "flex";
    let percent = 0;

    const interval = setInterval(() =>
    {
        percent += 10;
        progressBar.style.width = percent + "%";

        if (percent >= 100)
        {
            clearInterval(interval);
            progressBar.classList.add('complete');
            mergeButton.disabled = false;
            addMoreButton.disabled = false;
        }
    }, 80);
}

function hideDownloadLink()
{
    if (downloadClicked)
    {
        downloadLink.style.display = "none";
        downloadClicked = false;
    }
}

pageOrientation.addEventListener("change", hideDownloadLink);
pageSize.addEventListener("change", hideDownloadLink);
customWidth.addEventListener("input", hideDownloadLink);
customHeight.addEventListener("input", hideDownloadLink);
fileInput.addEventListener("change", hideDownloadLink);

downloadLink.addEventListener("click", function ()
{
    downloadClicked = true;
});

document.getElementById("pageSize").addEventListener("change", function ()
{
    const isCustom = this.value === "custom";
    customWidth.style.display = isCustom ? "inline-block" : "none";
    customHeight.style.display = isCustom ? "inline-block" : "none";
});

async function mergeDocuments()
{
    if (allFiles.length === 0)
    {
        alert("Please select at least two files.");
        return;
    }

    const { PDFDocument, rgb } = PDFLib;
    const mergedPdf = await PDFDocument.create();

    const orientation = pageOrientation.value;

    for (const file of allFiles)
    {
        const fileType = file.type;

        if (fileType === "application/pdf")
        {
            const reader = new FileReader();
            const pdfBytes = await new Promise((resolve) =>
            {
                reader.onload = (event) => resolve(event.target.result);
                reader.readAsArrayBuffer(file);
            });

            const pdfDoc = await PDFDocument.load(pdfBytes);

            for (let i = 0; i < pdfDoc.getPageCount(); i++)
            {
                const [pdfPage] = await mergedPdf.copyPages(pdfDoc, [i]);

                const originalWidth = pdfPage.getWidth();
                const originalHeight = pdfPage.getHeight();
                let { width: pageWidth, height: pageHeight } = getPageSize(originalWidth, originalHeight);

                if (orientation === "landscape" && pageWidth < pageHeight)
                {
                    [pageWidth, pageHeight] = [pageHeight, pageWidth];
                }

                let scale = Math.min(pageWidth / originalWidth, pageHeight / originalHeight);
                let displayWidth = originalWidth * scale;
                let displayHeight = originalHeight * scale;
                let x = (pageWidth - displayWidth) / 2;
                let y = (pageHeight - displayHeight) / 2;

                const newPage = mergedPdf.addPage([pageWidth, pageHeight]);
                newPage.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) });
                const embeddedPage = await mergedPdf.embedPage(pdfPage);
                newPage.drawPage(embeddedPage, { x, y, width: displayWidth, height: displayHeight });
            }
        } else if (fileType.startsWith("image/") || file.name.endsWith(".svg"))
        {
            const imageDataUrl = await fixImageRotation(file);
            const imagePdf = await PDFDocument.create();
            const imageBytes = await (await fetch(imageDataUrl)).arrayBuffer();
            const embeddedImage = await imagePdf.embedJpg(imageBytes);

            const imgWidth = embeddedImage.width;
            const imgHeight = embeddedImage.height;
            let { width: pageWidth, height: pageHeight } = getPageSize(imgWidth, imgHeight);

            if (orientation === "landscape" && pageWidth < pageHeight)
            {
                [pageWidth, pageHeight] = [pageHeight, pageWidth];
            }

            let scale = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
            let displayWidth = imgWidth * scale;
            let displayHeight = imgHeight * scale;
            let x = (pageWidth - displayWidth) / 2;
            let y = (pageHeight - displayHeight) / 2;

            const page = imagePdf.addPage([pageWidth, pageHeight]);
            page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) });
            page.drawImage(embeddedImage, { x, y, width: displayWidth, height: displayHeight });

            const imgPdfBytes = await imagePdf.save();
            const imgPdfDoc = await PDFDocument.load(imgPdfBytes);
            const imgPages = await mergedPdf.copyPages(imgPdfDoc, imgPdfDoc.getPageIndices());
            imgPages.forEach((page) => mergedPdf.addPage(page));
        }
    }

    const mergedPdfBytes = await mergedPdf.save();
    const blob = new Blob([mergedPdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download = "merged_documents.pdf";
    downloadLink.style.display = "block";
    downloadLink.innerText = "Download Merged PDF";
}

function getPageSize(imgWidth = 595, imgHeight = 842)
{
    const size = pageSize.value;
    const customW = customWidth.value;
    const customH = customHeight.value;

    const sizes = {
        A4: { width: 595, height: 842 },
        Letter: { width: 612, height: 792 },
        Legal: { width: 612, height: 1008 }
    };

    if (size === "custom")
    {
        return { width: parseInt(customW) || 595, height: parseInt(customH) || 842 };
    } else if (size === "auto")
    {
        return { width: imgWidth, height: imgHeight };
    } else
    {
        return sizes[size];
    }
}

function fixImageRotation(file)
{
    return new Promise((resolve) =>
    {
        const reader = new FileReader();
        reader.onload = function (event)
        {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function ()
            {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                canvas.width = img.width;
                canvas.height = img.height;
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);

                resolve(canvas.toDataURL("image/jpeg"));
            };
        };
        reader.readAsDataURL(file);
    });
}

import * as pdfjs from "pdfjs-dist";

import { MarkdownPreviewView, MarkdownRenderChild } from "obsidian";
import { PDFBlockParameters } from "./processor";
import { SlideNoteSettings } from "../settings";
import { FileCache } from "./cache";

export class PDFBlockRenderer extends MarkdownRenderChild {
	el: HTMLElement
	params: PDFBlockParameters
	sourcePath: string
	settings: SlideNoteSettings
	cache: FileCache
	public constructor(
		el: HTMLElement,
		params: PDFBlockParameters,
		sourcePath: string,
		settings: SlideNoteSettings,
		cache: FileCache
	) {
		super(el);
		this.el = el;
		this.params = params;
		this.sourcePath = sourcePath;
		this.settings = settings;
		this.cache = cache;
	}

	onload() {
		this.init();
		this.registerEvent(
			app.vault.on("modify", (file) => {
				if (file.path == this.params.file ) {
					this.cache.invalid(file.path)
					this.render();
				}
			})
		)
	}

	async init() {
		const hook = this.el.createEl("div");
		hook.addClass("slide-note-loading-hook");
		const loader = hook.createEl("div");
		loader.addClass("loader");

		const pos = hook.getBoundingClientRect().bottom;

		if (pos != 0) {
			this.render();
		}
		else {
			const delay = window.setInterval(
				() => {
					clearInterval(delay);
					this.render();
				},
				(this.params.page[0] % 15 + 1) * 5000
			)

			function renderCallBcak() {
				if (hook.getBoundingClientRect().bottom != 0) {
					clearInterval(delay);
					this.render();
				}
			}
			document.addEventListener("wheel", renderCallBcak.bind(this));
			document.addEventListener("touchmove",  renderCallBcak.bind(this));
		}
	}

	async render() {
		this.el.innerHTML = "";
		if (this.params !== null) {
			try {
				const buffer = await this.cache.get(this.params.file);

				if (!this.checkActiveFile(this.sourcePath))
					return;

				const document = await pdfjs.getDocument(buffer).promise;

				if (!this.checkActiveFile(this.sourcePath))
					return;

				if (this.params.page.includes(0)) {
					this.params.page = Array.from(
						{length: document.numPages},
						(_, i) => i + 1
					);
				}

				for (const pageNumber of this.params.page) {
					if (!this.checkActiveFile(this.sourcePath))
						return;

					const page = await document.getPage(pageNumber);
					let host = this.el.createEl("div");

					if (this.params.link) {
						const href = host.createEl("a");
						href.href = this.params.file + "#page=" + pageNumber;
						href.className = "internal-link";
						host = href;
					}

					const canvas = host.createEl("canvas");
					canvas.style.width = `${Math.floor(this.params.scale * 100)}%`;

					if (!this.checkActiveFile(this.sourcePath))
						return;

					const context = canvas.getContext("2d");
					const zoom = 2
					const offsetX = this.params.rect[0] == -1 ? 0 : - this.params.rect[0] * page.view[2] * zoom;
					const offsetY = this.params.rect[1] == -1 ? 0 : - this.params.rect[1] * page.view[3] * zoom;
					const pageview = page.getViewport({
						scale: zoom,
						rotation: this.params.rotat,
						offsetX: offsetX,
						offsetY: offsetY,
					});

					const effectWidth = this.params.rect[0] == -1 ?
						pageview.width : Math.floor(this.params.rect[2] * page.view[2] * zoom);

					const effectHeight = this.params.rect[1] == -1 ?
						pageview.height : Math.floor(this.params.rect[3] * page.view[3] * zoom);
					canvas.width = effectWidth;
					canvas.height = effectHeight;

					const renderContext = {
						canvasContext: context,
						viewport: pageview,
					};

					if (!this.checkActiveFile(this.sourcePath))
						return;

					canvas.addEventListener("mouseup", (event)=> {
						app.workspace.trigger("slidenote:mouseup", event);
					});

					await page.render(renderContext).promise.then(
						() => {
							if (this.params.annot != "" && this.settings.allow_annotations) {
								try {
									const annots = new Function(
										"ctx", "zoom", "w", "h",
										`
											function H(n) { 
												if (n > 0 && n < 1) return n * zoom * h;
												else return n * zoom;
											}
											function W(n) {
												if (n > 0 && n < 1) return n * zoom * w;
												else return n * zoom;
											}
											ctx.font=\`\${25 * zoom}px Arial\`
											${this.params.annot}
										`
									);
									annots(context, zoom, effectWidth / zoom, effectHeight / zoom);
								} catch (error) {
									throw new Error(`Annotation Failed: ${error}`);
								}

							}
						}
					)

				}
				MarkdownPreviewView.renderMarkdown(this.params.note, this.el, this.sourcePath, this);
			} catch (error) {
				const p = this.el.createEl("p", {text: "[SlideNote] Render Error: " + error});
				p.style.color = "red";
			}
		}
	}

	checkActiveFile(ctx_file: string) {
		const cur_file = app.workspace.getActiveFile()?.path;
		if (cur_file == undefined)
			return true;
		else if (ctx_file != cur_file)
			return false;
		else
			return true;
	}

}

const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const jsdom = require('jsdom');
const css = require('css');
const axios = require('axios');
const { JSDOM } = jsdom;

async function applyInlineStyles(htmlPath) {
	const htmlContent = fs.readFileSync(htmlPath, 'utf8');
	const dom = new JSDOM(htmlContent);
	const document = dom.window.document;

	// Сбор стилей из <style> тегов
	const styleTags = document.querySelectorAll('style');
	let cssRules = '';
	styleTags.forEach(styleTag => {
		cssRules += styleTag.textContent;
		styleTag.remove();
	});

	// Сбор стилей из внешних файлов CSS
	const linkTags = document.querySelectorAll('link[rel="stylesheet"]');
	for (let linkTag of linkTags) {
		const href = linkTag.getAttribute('href');
		if (href) {
			try {
				let externalCSS = '';
				if (href.startsWith('http')) {
					// Загружаем внешний CSS по URL
					const response = await axios.get(href);
					externalCSS = response.data;
				} else {
					// Локальные CSS файлы
					const filePath = path.resolve(path.dirname(htmlPath), href);
					externalCSS = fs.readFileSync(filePath, 'utf8');
				}
				cssRules += externalCSS;
			} catch (err) {
				console.error(`Ошибка при загрузке CSS из ${href}:`, err);
			}
		}
		linkTag.remove(); // Удаляем <link> тег, так как стили уже применены
	}

	// Разбор CSS
	const parsedCSS = css.parse(cssRules);
	if (parsedCSS.stylesheet) {
		parsedCSS.stylesheet.rules.forEach(rule => {
			if (rule.type === 'rule') {
				rule.selectors.forEach(selector => {
					// Применение стилей ко всем элементам, соответствующим селектору
					document.querySelectorAll(selector).forEach(element => {
						// Получаем текущие инлайновые стили элемента
						let inlineStyle = element.getAttribute('style') || '';
						let className = selector.replace(/\./g, '');

						// Применяем стили для этого селектора
						const newStyle = rule.declarations.map(decl => `${decl.property}: ${decl.value};`).join(' ');

						// Если уже есть инлайн стиль, добавляем новый стиль
						inlineStyle = `${inlineStyle} ${newStyle}`.trim();
						element.setAttribute('style', inlineStyle);
						console.log(element.tagName + ' [' + selector + '] {' + inlineStyle + '}');
						element.classList.remove(className);

						if (element.classList.length === 0) {
							element.removeAttribute('class');
						}
					});
				});
			}
		});
	}

	// Создание нового файла с _rawed.html
  const lockedElement = document.querySelector('[data-lock="true"]');

  if (lockedElement) {
    // If found, serialize only the content within this element
    const newHtmlContent = lockedElement.innerHTML;
    const newHtmlPath = path.join(path.dirname(htmlPath), path.basename(htmlPath, path.extname(htmlPath)) + '_rawed.html');
    fs.writeFileSync(newHtmlPath, newHtmlContent, 'utf8');
    console.log(`Файл сохранён как: ${newHtmlPath}`);
  } else {
    // If not found, write the entire HTML content to the file
    const newHtmlPath = path.join(path.dirname(htmlPath), path.basename(htmlPath, path.extname(htmlPath)) + '_rawed.html');
    fs.writeFileSync(newHtmlPath, dom.serialize(), 'utf8');
    console.log(`Файл сохранён как: ${newHtmlPath}`);
  }
}

// Запуск Electron
app.whenReady().then(() => {
	dialog.showOpenDialog({
		title: 'Выберите HTML-файл',
		defaultPath: process.cwd(),
		filters: [{ name: 'HTML Files', extensions: ['html'] }],
		properties: ['openFile']
	}).then(result => {
		if (!result.canceled && result.filePaths.length > 0) {
			applyInlineStyles(result.filePaths[0]);
		}
		app.quit();
	}).catch(err => {
		console.error('Ошибка при выборе файла:', err);
		app.quit();
	});
});

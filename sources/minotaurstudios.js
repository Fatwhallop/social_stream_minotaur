(function () {
	 
	var isExtensionOn = true;
	function toDataURL(url, callback) {
	  var xhr = new XMLHttpRequest();
	  xhr.onload = function() {
		var blob = xhr.response;
    
		if (blob.size > (25 * 1024)) {
		  callback(url); // Image size is larger than 25kb.
		  return;
		}

		var reader = new FileReader();
		
		reader.onloadend = function() {
		  callback(reader.result);
		}
		reader.readAsDataURL(xhr.response);
	  };
	  xhr.open('GET', url);
	  xhr.responseType = 'blob';
	  xhr.send();
	}

	function escapeHtml(unsafe){ // when goofs be trying to hack me
		return unsafe
			 .replace(/&/g, "&amp;")
			 .replace(/</g, "&lt;")
			 .replace(/>/g, "&gt;")
			 .replace(/"/g, "&quot;")
			 .replace(/'/g, "&#039;") || "";
	}
	
	function getAllContentNodes(element) { // takes an element.
		var resp = "";

		if (!element){return resp;}
		
		if (!element.childNodes || !element.childNodes.length){
			if (element.textContent){
				return escapeHtml(element.textContent) || "";
			} else {
				return "";
			}
		}
		
		element.childNodes.forEach(node=>{
			if (node.childNodes.length){
				resp += getAllContentNodes(node)
			} else if ((node.nodeType === 3) && node.textContent && (node.textContent.trim().length > 0)){
				resp += escapeHtml(node.textContent);
			} else if (node.nodeType === 1){
				if (!settings.textonlymode){
					if ((node.nodeName == "IMG") && node.src){
						node.src = node.src+"";
					}
					resp += node.outerHTML;
				}
			}
		});
		return resp;
	}
	
	function processMessage(ele){
		console.log("[Minotaur] Processing message element:", ele);
		
		var chatimg = "";
		
		var name = "";
		try {
			name = escapeHtml(ele.querySelector(".message-name").textContent.trim());
		} catch(e){
			console.log("[Minotaur] Could not find username:", e);
		}
		
		var msg = "";
		try {
			msg = getAllContentNodes(ele.querySelector(".message-text"));
		} catch(e){
			console.log("[Minotaur] Could not find message text:", e);
		}
		
		var avatarUrl = "";
		try {
			var avatarImg = ele.querySelector(".message-avatar");
			if (avatarImg && avatarImg.src) {
				avatarUrl = avatarImg.src;
			}
		} catch(e){}
		
		var nameColor = "";
		try {
			var nameElement = ele.querySelector(".message-name");
			if (nameElement) {
				nameColor = getComputedStyle(nameElement).color || "";
			}
		} catch(e){}
		
		var ssnUserId = ele.getAttribute('data-userid') || ele.dataset.userid || "";
		var ssnChatName = ele.getAttribute('data-chatname') || ele.dataset.name || name;
		
		var data = {};
		data.chatname = ssnChatName || name;
		data.chatbadges = "";
		data.backgroundColor = "";
		data.textColor = "";
		data.nameColor = nameColor;
		data.chatmessage = msg;
		data.chatimg = avatarUrl;
		data.hasDonation = "";
		data.membership = "";
		data.contentimg = "";
		data.textonly = settings.textonlymode || false;
		data.type = "minotaurstudios";
		data.userid = ssnUserId;
		

		if (ele.dataset) {
			data.platform = ele.dataset.platform || "website";
			data.messageId = ele.dataset.messageId || "";
			data.timestamp = ele.dataset.timestamp || "";
		}
		
		console.log("[Minotaur] Extracted data:", data);
		pushMessage(data);
	}

	function pushMessage(data){
		try{
			chrome.runtime.sendMessage(chrome.runtime.id, { "message": data }, function(e){});
		} catch(e){
			console.log("[Minotaur] Error pushing message:", e);
		}
	}
	
	var settings = {};
	
	chrome.runtime.sendMessage(chrome.runtime.id, { "getSettings": true }, function(response){
		if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError) { return; }
		response = response || {};
		if ("settings" in response){
			settings = response.settings;
		}
	});

	chrome.runtime.onMessage.addListener(
		function (request, sender, sendResponse) {
			try{
				if ("getSource" == request){
					sendResponse("minotaurstudios");
					return;
				}
				if ("focusChat" == request){
					var textarea = document.querySelector('textarea.chat-input');
					if (textarea) {
						textarea.focus();
						sendResponse(true);
					} else {
						sendResponse(false);
					}
					return;
				}
				if (typeof request === "object"){
					if ("settings" in request){
						settings = request.settings;
						sendResponse(true);
						return;
					}
				}
			} catch(e){}
			sendResponse(false);
		}
	);

	var lastURL = "";
	var observer = null;
	
	function onElementInserted(containerSelector) {
		var target = document.querySelector(containerSelector);
		if (!target){
			console.log("[Minotaur] Container not found:", containerSelector);
			return;
		}
		
		console.log("[Minotaur] Starting to observe container:", containerSelector);
		
		var onMutationsObserved = function(mutations) {
			mutations.forEach(function(mutation) {
				if (mutation.addedNodes.length) {
					for (var i = 0, len = mutation.addedNodes.length; i < len; i++) {
						try {
							var node = mutation.addedNodes[i];
							if (node.skip){continue;}
							
							if (node.nodeType === 1 && node.classList && node.classList.contains('message-line')) {
								node.skip = true;
								processMessage(node);
							}
							
							if (node.querySelectorAll) {
								var messageElements = node.querySelectorAll('.message-line');
								messageElements.forEach(function(msgEle) {
									if (!msgEle.skip) {
										msgEle.skip = true;
										processMessage(msgEle);
									}
								});
							}
						} catch(e){
							console.log("[Minotaur] Error processing mutation:", e);
						}
					}
				}
			});
		};
		
		var config = { childList: true, subtree: true };
		var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
		
		observer = new MutationObserver(onMutationsObserved);
		observer.observe(target, config);
		
		console.log("[Minotaur] Observer started on:", containerSelector);
	}
	
	console.log("[Minotaur] Social stream injected for Minotaur Studios");

	function initializeChatWatcher() {
		var containerSelectors = [
			'#chat-messages',
			'.message-container',
			'.chat-stream'
		];
		
		for (var i = 0; i < containerSelectors.length; i++) {
			var container = document.querySelector(containerSelectors[i]);
			if (container) {
				console.log("[Minotaur] Found chat container with selector:", containerSelectors[i]);
				
				if (!container.marked) {
					container.marked = true;
					
					setTimeout(function() {
						var existingMessages = container.querySelectorAll('.message-line');
						console.log("[Minotaur] Found", existingMessages.length, "existing messages");
						
						existingMessages.forEach(function(ele, index) {
							setTimeout(function() {
								ele.skip = true;
								processMessage(ele);
							}, index * 100);
						});
						
						onElementInserted(containerSelectors[i]);
					}, 1000);
				}
				return;
			}
		}
		
		console.log("[Minotaur] Chat container not found yet, retrying...");
		setTimeout(initializeChatWatcher, 2000);
	}

	setTimeout(initializeChatWatcher, 1000);

})();

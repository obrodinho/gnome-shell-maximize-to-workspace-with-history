
RSYNC = rsync -av
EXCLUDES = --exclude=./
INCLUDES = --include=./metadata.json --include=./extension.js --include=./LICENSE 

SOURCE = ./

GNOME_SHELL_EXTENSIONS_PATH = ~/.local/share/gnome-shell/extensions
DOMAIN_NAME = brodinho.dev
PACKAGE_NAME = maximize-to-workspace

FILE_NAME = $(PACKAGE_NAME)@$(DOMAIN_NAME)
DESTINATION = $(GNOME_SHELL_EXTENSIONS_PATH)/$(FILE_NAME)

local-deploy:
	$(RSYNC) $(EXCLUDES) $(INCLUDES) $(SOURCE) $(DESTINATION)

local-redeploy:
	rm -rvf $(DESTINATION)
	make local-deploy
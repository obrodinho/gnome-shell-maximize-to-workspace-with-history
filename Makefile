
RSYNC = rsync -av
EXCLUDES = --exclude=.git --exclude=Makefile --exclude=.gitignore --exclude-from=.gitignore
INCLUDES = --include=metadata.json --include=extension.js --include=LICENSE

SOURCE = ./

GNOME_SHELL_EXTENSIONS_PATH = ~/.local/share/gnome-shell/extensions
DOMAIN_NAME = brodinho.dev
PROJECT_NAME = maximize-to-workspace

PACKAGE_NAME = $(PROJECT_NAME)@$(DOMAIN_NAME)
DESTINATION = $(GNOME_SHELL_EXTENSIONS_PATH)/$(PACKAGE_NAME)

enable:
	gnome-extensions enable $(PACKAGE_NAME)

disable:
	gnome-extensions disable $(PACKAGE_NAME)

follow-log:
	journalctl -f -o cat /usr/bin/gnome-shell

local-deploy:
	$(RSYNC) $(EXCLUDES) $(INCLUDES) $(SOURCE) $(DESTINATION)

clean:
	rm -rvf $(DESTINATION)

local-redeploy:
	make disable
	make clean
	make local-deploy

	echo "OK! Ready for phase 2? Restart Gnome Shell (ALT+F2, 'r' , 'Enter'), or logout and log back in."
	echo "After that, get back here and run 'make run'"

run:
	echo "Ready? Enabling extension and looking into shell logs. Good insights ahead!"
	echo "A moment... Please."
	sleep 1
	echo "Hit CTRL+C to cancel the logging ang get back your terminal. :)"

	make enable
	make follow-log
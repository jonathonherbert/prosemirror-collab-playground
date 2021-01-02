installNpm() {
  echo -e "\033[32mInstalling JS dependencies\033[0m\n"
  npm install
}

main() {
  installNpm
  echo -e "\033[32mInstallation complete.\033[0m\n"
}

main

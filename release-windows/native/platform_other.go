//go:build !windows

package main

import "errors"

func chooseFile(string, bool) (string, error) {
	return "", errors.New("系统文件选择窗口需要 Windows")
}
func findMagpie() string { return "" }

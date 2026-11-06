package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

type openFileName struct {
	Size                         uint32
	Owner, Instance              uintptr
	Filter, CustomFilter         *uint16
	MaxCustomFilter, FilterIndex uint32
	File                         *uint16
	MaxFile                      uint32
	FileTitle                    *uint16
	MaxFileTitle                 uint32
	InitialDir, Title            *uint16
	Flags                        uint32
	FileOffset, FileExtension    uint16
	DefaultExtension             *uint16
	CustomData, Hook             uintptr
	TemplateName                 *uint16
	Reserved                     uintptr
	ReservedFlags, FlagsEx       uint32
}

var dialogs = windows.NewLazySystemDLL("comdlg32.dll")
var user32 = windows.NewLazySystemDLL("user32.dll")

func wide(s string) *uint16 { p, _ := windows.UTF16PtrFromString(s); return p }
func chooseFile(name string, save bool) (string, error) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if unsafe.Sizeof(openFileName{}) != 152 {
		return "", fmt.Errorf("不支持的系统文件窗口结构")
	}
	file := make([]uint16, 32768)
	copy(file, utf16.Encode([]rune(name)))
	const explorer = 0x00080000
	const noChangeDir = 0x00000008
	const pathMustExist = 0x00000800
	const fileMustExist = 0x00001000
	const overwritePrompt = 0x00000002
	title, extension, pattern := "选择 Magpie 程序", "exe", "Magpie (magpie*.exe)\x00magpie*.exe\x00\x00"
	proc := dialogs.NewProc("GetOpenFileNameW")
	flags := uint32(explorer | noChangeDir | pathMustExist | fileMustExist)
	if save {
		title, extension, pattern = "保存 PNG", "png", "PNG 图片 (*.png)\x00*.png\x00\x00"
		proc = dialogs.NewProc("GetSaveFileNameW")
		flags = explorer | noChangeDir | pathMustExist | overwritePrompt
	}
	filter := utf16.Encode([]rune(pattern))
	owner, _, _ := user32.NewProc("GetForegroundWindow").Call()
	ofn := openFileName{Size: uint32(unsafe.Sizeof(openFileName{})), Owner: owner, Filter: &filter[0], FilterIndex: 1,
		File: &file[0], MaxFile: uint32(len(file)), Title: wide(title), Flags: flags, DefaultExtension: wide(extension)}
	ok, _, _ := proc.Call(uintptr(unsafe.Pointer(&ofn)))
	runtime.KeepAlive(ofn)
	runtime.KeepAlive(filter)
	runtime.KeepAlive(file)
	if ok == 0 {
		code, _, _ := dialogs.NewProc("CommDlgExtendedError").Call()
		if code != 0 {
			return "", fmt.Errorf("Windows 文件选择窗口错误 (0x%x)", code)
		}
		return "", nil
	}
	return windows.UTF16ToString(file), nil
}
func findMagpie() string {
	const key = `Software\Microsoft\Windows\CurrentVersion\App Paths\magpie.exe`
	var paths []string
	for _, hive := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
		k, err := registry.OpenKey(hive, key, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		val, kind, err := k.GetStringValue("")
		k.Close()
		if err == nil {
			if kind == registry.EXPAND_SZ {
				if expanded, e := registry.ExpandString(val); e == nil {
					val = expanded
				}
			}
			paths = append(paths, strings.Trim(val, "\""))
		}
	}
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		paths = append(paths, filepath.Join(local, "Programs", "magpie", "magpie.exe"))
	}
	for _, name := range []string{"magpie.exe", "magpie-cli-windows-amd64.exe", "magpie-cli-windows-arm64.exe"} {
		if path, err := exec.LookPath(name); err == nil {
			paths = append(paths, path)
		}
	}
	for _, path := range paths {
		if filepath.IsAbs(path) {
			if info, err := os.Stat(path); err == nil && !info.IsDir() {
				return path
			}
		}
	}
	return ""
}

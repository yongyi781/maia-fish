import { pgn } from "chessops"
import { writable } from "svelte/store"
import { MyNodeData } from "./MyNodeData"

export let currentNode = writable<pgn.Node<MyNodeData>>()

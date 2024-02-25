class Node {
    constructor(data) {
        this.data = data;
        this.next = null;
        this.prev = null;
    }
}

class LinkedList {
    constructor() {
        this.head = null;
        this.tail = null;
        this.length = 0;
        this.map = {};
    }

    queue(data) {
        if (!this.map[data]) {
            const newNode = new Node(data);
            if (!this.head) {
                this.head = newNode;
                this.tail = newNode;
            } else {
                newNode.prev = this.tail;
                this.tail.next = newNode;
                this.tail = newNode;
            }
            this.map[data] = newNode;
            this.length++;
        }
    }

    dequeue() {
        if (!this.head) {
            return null;
        }
        const data = this.head.data;
        const nextNode = this.head.next;

        if (nextNode) {
            nextNode.prev = null;
        } else {
            this.tail = null;
        }

        this.head = nextNode;
        delete this.map[data];
        this.length--;
        return data;
    }

    removeNode(data) {
        const nodeToRemove = this.map[data];
        if (!nodeToRemove) {
            return null;
        }

        const prevNode = nodeToRemove.prev;
        const nextNode = nodeToRemove.next;

        if (prevNode) {
            prevNode.next = nextNode;
        } else {
            this.head = nextNode;
        }

        if (nextNode) {
            nextNode.prev = prevNode;
        } else {
            this.tail = prevNode;
        }

        delete this.map[data];
        this.length--;
        return data;
    }

    includes(data) {
        return !!this.map[data];
    }
}

class Room {
    constructor(player1, player2) {
        this.players = [player1, player2];
        this.score = {
            [player1]: 0,
            [player2]: 0
        };
        this.status = {
            [player1]: "playing",
            [player2]: "playing"
        };
        this.rematchRequest = false;
        this.rematchInitiator = null;
    }
}
module.exports = { LinkedList, Room };
